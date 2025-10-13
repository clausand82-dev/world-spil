<?php
declare(strict_types=1);

/**
 * Sikker mini-udtryksevaluator:
 * - choice('key') → værdi fra overrides
 * - summary.a.b.c → tal fra summary
 * - tilladte tegn efter erstatning: 0-9 . + - * / ( ) mellemrum
 */
function pe_eval_expr(string $expr, array $context): float {
  // choice('...')
  $expr = preg_replace_callback("/choice\\('(.*?)'\\)/", function($m) use ($context) {
    $k = (string)$m[1];
    $v = $context['choices'][$k] ?? 0;
    if (!is_numeric($v)) $v = ($v === true ? 1 : 0);
    return (string)($v + 0);
  }, $expr);

  // summary.x.y.z
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

  // whitelist af tegn
  $safe = preg_replace('/[\d\.\+\-\*\/\(\)\s]/', '', $expr);
  if ($safe !== '') return 0.0;

  try {
    // phpcs:ignore
    $val = eval('return (float)(' . $expr . ');');
    if (!is_numeric($val)) return 0.0;
    return (float)$val;
  } catch (\Throwable $e) {
    return 0.0;
  }
}

/**
 * Beregn effekter fra schema + overrides (kun når værdi != default).
 * Returner ['stats'=>[...], 'sources'=>[...]]
 */
function policy_compute_effects(array $summary, array $schema, array $overridesByFamily): array {
  $out = ['stats'=>[], 'sources'=>[]];
  $family = (string)($schema['family'] ?? '');
  $fields = (array)($schema['fields'] ?? []);
  $overrides = (array)($overridesByFamily[$family] ?? []);
  if ($family === '' || empty($fields)) return $out;

  foreach ($fields as $key => $def) {
    $control = (array)($def['control'] ?? []);
    $defVal  = $control['default'] ?? null;
    $hasOverride = array_key_exists($key, $overrides);
    if (!$hasOverride) continue;

    $val = $overrides[$key];
    if (json_encode($val) === json_encode($defVal)) continue;

    $effects = (array)($def['effects'] ?? []);
    foreach ($effects as $eff) {
      $stat = (string)($eff['stat'] ?? '');
      $op   = (string)($eff['op']   ?? 'add'); // add|sub|mul|div
      if ($stat === '') continue;

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

      if (!isset($out['stats'][$stat])) {
        $out['stats'][$stat] = ($op === 'mul' || $op === 'div') ? 1.0 : 0.0;
      }
      switch ($op) {
        case 'add': $out['stats'][$stat] += $v; break;
        case 'sub': $out['stats'][$stat] -= $v; break;
        case 'mul': $out['stats'][$stat] *= ($v ?: 1.0); break;
        case 'div': $out['stats'][$stat] /= ($v ?: 1.0); break;
        default:    $out['stats'][$stat] += $v; break;
      }

      $out['sources'][$stat][] = ['from'=>"policy:$key",'family'=>$family,'value'=>$v,'op'=>$op];
    }
  }
  return $out;
}

function pe_requires_met(array $summary, array $req): bool {
  $state = (array)($summary['state'] ?? []);
  $ok = true;
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
  return $ok;
}
function pe_stage_ok(array $summary, ?int $min, ?int $max): bool {
  $s = (int)($summary['stage']['current'] ?? 0);
  if ($min !== null && $s < $min) return false;
  if ($max !== null && $s > $max) return false;
  return true;
}

// I policy_compute_effects(), før du anvender effects for et felt:
    $requires = (array)($def['requires'] ?? []);
    $min = isset($def['stageMin']) ? (int)$def['stageMin'] : null;
    $max = isset($def['stageMax']) ? (int)$def['stageMax'] : null;
    if (!pe_stage_ok($summary, $min, $max)) continue;
    if (!pe_requires_met($summary, $requires)) continue;