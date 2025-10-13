<?php
declare(strict_types=1);

/**
 * Mini-evaluator til simple matematik-udtryk:
 *  - choice('key') læser fra overrides
 *  - summary.a.b.c læser tal fra summary
 *  - tilladte chars efter substitution: 0-9 . + - * / ( ) whitespace
 */
function pe_eval_expr(string $expr, array $context): float {
  // choice('key')
  $expr = preg_replace_callback("/choice\\('(.*?)'\\)/", function($m) use ($context) {
    $k = (string)$m[1];
    $v = $context['choices'][$k] ?? 0;
    if (!is_numeric($v)) $v = ($v === true ? 1 : 0);
    return (string)($v + 0);
  }, $expr);

  // summary.a.b.c
  $expr = preg_replace_callback('/summary\.([A-Za-z0-9_\.]+)/', function($m) use ($context) {
    $path = explode('.', (string)$m[1]);
    $cur = $context['summary'] ?? [];
    foreach ($path as $p) {
      if (is_array($cur) && array_key_exists($p, $cur)) {
        $cur = $cur[$p];
      } else {
        $cur = 0;
        break;
      }
    }
    return (string)(is_numeric($cur) ? ($cur + 0) : 0);
  }, $expr);

  // whitelist
  $rest = preg_replace('/[\d\.\+\-\*\/\(\)\s]/', '', $expr);
  if ($rest !== '') return 0.0;

  try {
    // phpcs:ignore
    $val = eval('return (float)(' . $expr . ');');
    return is_numeric($val) ? (float)$val : 0.0;
  } catch (\Throwable $e) {
    return 0.0;
  }
}

/** Krav: ejerskab af buildings/addons/research i summary.state */
function pe_requires_met(array $summary, array $req): bool {
  $state = (array)($summary['state'] ?? []);
  if (!empty($req['buildings'])) {
    foreach ($req['buildings'] as $id) {
      if (empty($state['bld'][$id])) return false;
    }
  }
  if (!empty($req['addons'])) {
    foreach ($req['addons'] as $id) {
      if (empty($state['add'][$id])) return false;
    }
  }
  if (!empty($req['research'])) {
    foreach ($req['research'] as $id) {
      if (empty($state['rsd'][$id])) return false;
    }
  }
  return true;
}

/** Stage-gating */
function pe_stage_ok(array $summary, ?int $min, ?int $max): bool {
  $s = (int)($summary['stage']['current'] ?? 0);
  if ($min !== null && $s < $min) return false;
  if ($max !== null && $s > $max) return false;
  return true;
}

/**
 * Beregn effekter fra schema + overrides (kun når værdi != default).
 * Returner ['stats'=>[...], 'sources'=>[...]]
 * Mul/Div map­pes til {stat}Multiplier-nøgler så apply-fasen kan multiplicere korrekt.
 */
function policy_compute_effects(array $summary, array $schema, array $overridesByFamily): array {
  $out = ['stats'=>[], 'sources'=>[]];

  $family    = (string)($schema['family'] ?? '');
  $fields    = (array)($schema['fields'] ?? []);
  $overrides = (array)($overridesByFamily[$family] ?? []);

  if ($family === '' || empty($fields)) {
    return $out;
  }

  foreach ($fields as $key => $def) {
    $control = (array)($def['control'] ?? []);
    $defVal  = $control['default'] ?? null;

    // Kun anvend ændringer (override skal findes og afvige fra default)
    if (!array_key_exists($key, $overrides)) {
      continue; // i felt-loop
    }
    $val = $overrides[$key];
    if (json_encode($val) === json_encode($defVal)) {
      continue; // i felt-loop
    }

    // Stage/Requires-gating per felt
    $min = isset($def['stageMin']) ? (int)$def['stageMin'] : null;
    $max = isset($def['stageMax']) ? (int)$def['stageMax'] : null;
    if (!pe_stage_ok($summary, $min, $max)) {
      continue; // i felt-loop
    }
    $requires = (array)($def['requires'] ?? []);
    if (!pe_requires_met($summary, $requires)) {
      continue; // i felt-loop
    }

    // Anvend effekter
    $effects = (array)($def['effects'] ?? []);
    foreach ($effects as $eff) {
      $stat = (string)($eff['stat'] ?? '');
      if ($stat === '') continue;

      $op = strtolower((string)($eff['op'] ?? 'add')); // add|sub|mul|div

      // Værdi
      $vRaw = $eff['value'] ?? 0;
      $v = 0.0;
      if (is_array($vRaw) && isset($vRaw['expr'])) {
        $v = pe_eval_expr((string)$vRaw['expr'], [
          'summary' => $summary,
          'choices' => $overrides,
        ]);
      } else {
        $v = (float)$vRaw;
      }

      // Map mul/div til særskilt multiplier-stat
      $targetStat = $stat;
      $isMulDiv = ($op === 'mul' || $op === 'div');
      if ($isMulDiv) {
        $targetStat = $stat . 'Multiplier';
      }

      // Init akkumulatorer
      if (!isset($out['stats'][$targetStat])) {
        $out['stats'][$targetStat] = $isMulDiv ? 1.0 : 0.0;
      }

      // Akkumuler
      switch ($op) {
        case 'add':
          $out['stats'][$targetStat] += $v;
          break;
        case 'sub':
          $out['stats'][$targetStat] -= $v;
          break;
        case 'mul':
          $out['stats'][$targetStat] *= ($v ?: 1.0);
          break;
        case 'div':
          $out['stats'][$targetStat] /= ($v ?: 1.0);
          break;
        default:
          $out['stats'][$targetStat] += $v;
          break;
      }

      // Kildesporing
      $out['sources'][$targetStat][] = [
        'from'   => "policy:$key",
        'family' => $family,
        'value'  => $v,
        'op'     => $op,
      ];
    }
  }

  return $out;
}