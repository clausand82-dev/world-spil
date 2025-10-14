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

/** Stage-gating */
function pe_stage_ok(array $summary, ?int $min, ?int $max): bool {
  $s = (int)($summary['stage']['current'] ?? 0);
  if ($min !== null && $s < $min) return false;
  if ($max !== null && $s > $max) return false;
  return true;
}

// Robust parse af requirement token strings som "bld.basecamp.l3" eller "basecamp.l3"
function pe_parse_req_token(string $token): ?array {
  if (!is_string($token) || $token === '') return null;
  $token = trim($token);

  // 1) Først: eksplicit domain.id(.lN) — dette skal håndtere 'rsd.tools.l2' korrekt
  if (preg_match('/^([a-zA-Z]+)\\.([A-Za-z0-9_\\-]+)(?:\\.l(\\d+))?$/', $token, $m)) {
    $rawDomain = strtolower($m[1]);
    $domainMap = ['bld'=>'bld','building'=>'bld','buildings'=>'bld','add'=>'add','addon'=>'add','addons'=>'add','rsd'=>'rsd','research'=>'rsd','researches'=>'rsd'];
    $domain = $domainMap[$rawDomain] ?? null;
    $id = $m[2];
    $minLevel = isset($m[3]) ? (int)$m[3] : null;
    return ['domain'=>$domain, 'id'=>$id, 'minLevel'=>$minLevel];
  }

  // 2) Fallback: id(.lN) — fx "basecamp.l3" eller "tools.l2"
  if (preg_match('/^([A-Za-z0-9_\\-\\.]+?)(?:\\.l?(\\d+))?$/', $token, $m2)) {
    $id = $m2[1];
    $minLevel = isset($m2[2]) ? (int)$m2[2] : null;
    return ['domain'=>null, 'id'=>$id, 'minLevel'=>$minLevel];
  }

  return null;
}

/**
 * Try to extract a usable "state" array from $summary.
 * Accepts:
 *  - $summary which already contains 'state' => [...]
 *  - $summary that contains 'gameData' => ['state'=>...]
 *  - otherwise returns empty array
 *
 * If you prefer the server to fetch state from DB, populate $summary['state'] before calling policy_compute_effects.
 */
function pe_extract_state_from_summary(array $summary): array {
  if (isset($summary['state']) && is_array($summary['state'])) return $summary['state'];
  if (isset($summary['gameData']) && is_array($summary['gameData']) && isset($summary['gameData']['state']) && is_array($summary['gameData']['state'])) {
    return $summary['gameData']['state'];
  }
  // fallback: sometimes state might be nested differently; try top-level keys
  $possible = [];
  foreach (['state','game','gameData','ctx'] as $k) {
    if (isset($summary[$k]) && is_array($summary[$k]) && isset($summary[$k]['state']) && is_array($summary[$k]['state'])) {
      return $summary[$k]['state'];
    }
  }
  return $possible;
}

// --- Erstat pe_get_owned_level med denne mere permissive/normaliserende version ---
function pe_get_owned_level(array $state, string $domain, string $id): int {
  if (!isset($state[$domain]) || !is_array($state[$domain])) return 0;
  $tree = $state[$domain];

  // Helper: clean an id/key to a canonical id (strip leading domain prefixes and .lN suffixes)
  $normalizeKey = function(string $k) use ($domain) {
    $k = trim($k);
    // remove repeated domain prefixes like "bld.bld.basecamp.13.13"
    $k = preg_replace('/^(?:' . preg_quote($domain, '/') . '\.)+/i', '', $k);
    // remove any leading other domain prefixes (e.g. "bld." or "rsd.")
    $k = preg_replace('/^[a-zA-Z]+\./', '', $k);
    // remove trailing .lN or numeric suffixes
    $k = preg_replace('/(\\.l?\\d+)+$/i', '', $k);
    $k = trim($k, '.');
    return $k;
  };

  // Normalize requested id
  $requested = $normalizeKey($id);

  // 1) Exact key match (canonical)
  if (array_key_exists($requested, $tree)) {
    $slot = $tree[$requested];
    if (is_int($slot)) return $slot;
    if (is_array($slot) && isset($slot['level'])) return (int)$slot['level'];
    if (is_object($slot) && isset($slot->level)) return (int)$slot->level;
    return is_numeric($slot) ? (int)$slot : 1;
  }

  // 2) If there is a domain-prefixed .lN exact key
  // Try to find any key like "{$domain}.{$requested}.lN" and return the max level found
  $maxFound = 0;
  foreach ($tree as $k => $v) {
    $clean = $normalizeKey((string)$k);
    if ($clean === $requested) {
      // try read level from value if present
      if (is_array($v) && isset($v['level'])) $maxFound = max($maxFound, (int)$v['level']);
      elseif (is_object($v) && isset($v->level)) $maxFound = max($maxFound, (int)$v->level);
      elseif (is_numeric($v)) $maxFound = max($maxFound, (int)$v);
      // also try extract level from key suffix .lN
      if (preg_match('/\\.l(\\d+)$/i', (string)$k, $mm)) $maxFound = max($maxFound, (int)$mm[1]);
    }
  }
  if ($maxFound > 0) return $maxFound;

  // 3) Fallback: scan for any key that contains the requested id token
  foreach ($tree as $k => $v) {
    if (stripos($k, $requested) !== false || stripos($k, "{$domain}.{$requested}") !== false) {
      if (is_array($v) && isset($v['level'])) return (int)$v['level'];
      if (is_object($v) && isset($v->level)) return (int)$v->level;
      if (is_numeric($v)) return (int)$v;
      if (preg_match('/\\.l(\\d+)$/i', (string)$k, $mm)) return (int)$mm[1];
      return 1;
    }
  }

  return 0;
}

/**
 * Krav helper: expects $req as array with optional keys 'buildings','addons','research'
 * Returns true if ALL listed requirements are satisfied (AND semantics per-list).
 *
 * This function now uses pe_extract_state_from_summary to be resilient if summary
 * doesn't include state in the expected place. Best practice: ensure you populate
 * $summary['state'] before calling policy_compute_effects (e.g. in summary.php).
 */
function pe_requires_met(array $summary, array $req): bool {
  if (empty($req)) return true;
  $state = pe_extract_state_from_summary($summary);
  // support alias keys in $req
  $groups = [
    'bld' => $req['buildings'] ?? $req['bld'] ?? null,
    'add' => $req['addons'] ?? $req['add'] ?? null,
    'rsd' => $req['research'] ?? $req['rsd'] ?? null,
  ];

  foreach ($groups as $domain => $list) {
    if (empty($list)) continue;
    $items = is_array($list) ? $list : [$list];
    foreach ($items as $entry) {
      if (is_string($entry)) {
        $spec = pe_parse_req_token($entry);
      } elseif (is_array($entry) && isset($entry['id'])) {
        $spec = [
          'domain' => $entry['domain'] ?? $domain,
          'id'     => $entry['id'],
          'minLevel' => isset($entry['minLevel']) ? (int)$entry['minLevel'] : (isset($entry['level']) ? (int)$entry['level'] : null)
        ];
      } else {
        // unknown format -> fail requirement
        return false;
      }
      if (!$spec || !isset($spec['domain']) || !isset($spec['id'])) return false;
      $have = pe_get_owned_level($state, $spec['domain'], $spec['id']);
      $need = isset($spec['minLevel']) ? (int)$spec['minLevel'] : null;
      if ($need !== null) {
        if ($have < $need) return false; // >= is correct satisfaction
      } else {
        if ($have <= 0) return false;
      }
    }
  }
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