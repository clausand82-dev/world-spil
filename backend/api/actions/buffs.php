<?php
declare(strict_types=1);

/**
 * Buff helpers og anvendelse til cost, speed og yield.
 *
 * JSON-normaliseret buff-spec (fra XML):
 * - kind: "res" | "speed"
 * - For kind="res":
 *     scope/id: "all"|"solid"|"liquid"|"res.xxx"
 *     mode: "yield"|"cost"|"both"
 *     op/type: "adds"|"subt"|"mult"
 *     amount: number (mult = procent)
 *     applies_to: "all"|[ids]|grupper: "buildings","addons","research"
 *     source_id: fx "bld.basecamp.l1"
 *     start_ts?: int (unix), end_ts?: int (unix)
 * - For kind="speed":
 *     actions: "all"|["build","upgrade","produce","combine"]
 *     op: "mult"
 *     amount: number (5 = 5% hurtigere)
 *     applies_to, source_id, start_ts, end_ts som ovenfor
 */

// ---------------------- tidsvindue ----------------------
function is_buff_in_window(array $buff, ?int $now = null): bool {
  if ($now === null) $now = time();
  if (isset($buff['start_ts']) && $now < (int)$buff['start_ts']) return false;
  if (isset($buff['end_ts'])   && $now > (int)$buff['end_ts'])   return false;
  return true;
}

// ---------------------- applies_to (ctx) ----------------------
function ctx_matches($applies_to, string $ctx_id): bool {
  if (!$applies_to) return false;
  if ($applies_to === 'all') return true;
  $arr = is_array($applies_to)
    ? $applies_to
    : array_values(array_filter(array_map('trim', preg_split('~[,;]~', (string)$applies_to ?? 'all'))));
  if (!$arr) return false;
  if (in_array('all', $arr, true)) return true;

  if (str_starts_with($ctx_id, 'bld.') && in_array('buildings', $arr, true)) return true;
  if (str_starts_with($ctx_id, 'add.') && in_array('addons', $arr, true)) return true;
  if (str_starts_with($ctx_id, 'rsd.') && in_array('research', $arr, true)) return true;

  return in_array($ctx_id, $arr, true);
}

// ---------------------- res-scope ----------------------
function res_scope_matches($scope, string $res_id): bool {
  $scope = $scope ?? 'all';
  if ($scope === 'all') return true;
  $rid = (string)$res_id;
  if ($scope === 'solid') {
    return (str_starts_with($rid, 'res.') && !str_starts_with($rid, 'res.water') && !str_starts_with($rid, 'res.oil'));
  }
  if ($scope === 'liquid') {
    return (str_starts_with($rid, 'res.water') || str_starts_with($rid, 'res.oil'));
  }
  $sc = (string)$scope;
  if (str_starts_with($sc, 'res.') && str_starts_with($rid, 'res.')) return $sc === $rid;
  return false;
}

// ---------------------- ejer-check til filtrering af buffs ----------------------
function is_source_owned(?string $source_id, array $state): bool {
  if (!$source_id) return true;
  if (str_starts_with($source_id, 'rsd.')) {
    $k = preg_replace('~^rsd\.~','', $source_id);
    return !empty($state['rsd'][$k]) || !empty($state['research'][$k]) || !empty($state['rsd'][$source_id]);
  }
  if (str_starts_with($source_id, 'bld.')) {
    return !empty($state['bld'][$source_id]);
  }
  if (str_starts_with($source_id, 'add.')) {
    return !empty($state['add'][$source_id]);
  }
  if (str_starts_with($source_id, 'ani.')) {
    $v = $state['ani'][$source_id] ?? null;
    $qty = is_array($v) ? (float)($v['quantity'] ?? 0) : (float)$v;
    return $qty > 0;
  }
  return true;
}

// ---------------------- indsamling af aktive buffs ----------------------
function collect_active_buffs(array $defs, array $state = [], ?int $now = null): array {
  if ($now === null) $now = time();
  $out = [];
  foreach (['bld','add','rsd'] as $bucket) {
    if (empty($defs[$bucket])) continue;
    foreach ($defs[$bucket] as $id => $def) {
      $buffList = $def['buffs'] ?? null;
      if (!is_array($buffList)) continue;
      foreach ($buffList as $b) {
        if (!is_buff_in_window($b, $now)) continue;
        $src = $b['source_id'] ?? (is_string($id) ? ($bucket . '.' . $id) : null);
        if (!is_source_owned($src, $state)) continue;
        $out[] = $b;
      }
    }
  }
  return $out;
}

// ---------------------- COST ----------------------
function apply_cost_buffs(array $baseCost, string $ctx_id, array $buffs): array {
  $result = $baseCost;

  // adds/subt
  foreach ($buffs as $b) {
    if (($b['kind'] ?? '') !== 'res') continue;
    $mode = $b['mode'] ?? 'both';
    if ($mode !== 'cost' && $mode !== 'both') continue;
    if (!ctx_matches($b['applies_to'] ?? 'all', $ctx_id)) continue;

    $scope = $b['scope'] ?? ($b['id'] ?? 'all');
    $op = $b['op'] ?? $b['type'] ?? '';
    $amt = (float)($b['amount'] ?? 0);
    if (!$amt) continue;

    foreach ($result as $rid => $val) {
      if (!res_scope_matches($scope, $rid)) continue;
      if ($op === 'adds') $result[$rid] = max(0, $val + $amt);
      if ($op === 'subt') $result[$rid] = max(0, $val - $amt);
    }
  }

  // mult (positivt = billigere)
  foreach ($buffs as $b) {
    if (($b['kind'] ?? '') !== 'res') continue;
    $mode = $b['mode'] ?? 'both';
    if ($mode !== 'cost' && $mode !== 'both') continue;
    if (($b['op'] ?? $b['type'] ?? '') !== 'mult') continue;
    if (!ctx_matches($b['applies_to'] ?? 'all', $ctx_id)) continue;

    $scope = $b['scope'] ?? ($b['id'] ?? 'all');
    $pct = (float)($b['amount'] ?? 0);
    if (!$pct) continue;

    foreach ($result as $rid => $val) {
      if (!res_scope_matches($scope, $rid)) continue;
      $mul = max(0.0, 1 - ($pct / 100)); // 5% → 0.95x
      $result[$rid] = max(0, $val * $mul);
    }
  }

  return $result;
}

// ---------------------- SPEED ----------------------
function apply_speed_buffs(int $baseSeconds, string $action, string $ctx_id, array $buffs): int {
  $dur = max(0, $baseSeconds);
  $mul = 1.0;
  foreach ($buffs as $b) {
    if (($b['kind'] ?? '') !== 'speed') continue;
    if (($b['op'] ?? $b['type'] ?? '') !== 'mult') continue;
    if (!ctx_matches($b['applies_to'] ?? 'all', $ctx_id)) continue;

    $acts = $b['actions'] ?? $b['target'] ?? 'all';
    $ok = $acts === 'all' || (is_array($acts) ? in_array($action, $acts, true) : in_array($action, array_map('trim', explode(',', (string)$acts)), true));
    if (!$ok) continue;

    $pct = (float)($b['amount'] ?? 0);
    if (!$pct) continue;
    $mul *= max(0.0, 1 - ($pct / 100)); // 5% hurtigere → 0.95x tid
  }

  // valgfri cap, fx min 20% af base
  $mul = max($mul, 0.2);
  return (int)round($dur * $mul);
}

// ---------------------- YIELD ----------------------
if (!function_exists('apply_yield_buffs_assoc')) {
  // $assoc: ['res.wood'=>12.5, ...] per kilde
  // $ctxId: fx 'bld.basecamp.l1'
  function apply_yield_buffs_assoc(array $assoc, string $ctxId, array $buffs): array {
    if (empty($buffs) || empty($assoc)) return $assoc;
    $result = $assoc;

    // adds/subt
    foreach ($buffs as $b) {
      if (($b['kind'] ?? '') !== 'res') continue;
      $mode = $b['mode'] ?? 'both';
      if ($mode !== 'yield' && $mode !== 'both') continue;
      if (!ctx_matches($b['applies_to'] ?? 'all', $ctxId)) continue;
      $scope = $b['scope'] ?? ($b['id'] ?? 'all');
      $op = $b['op'] ?? $b['type'] ?? '';
      $amt = (float)($b['amount'] ?? 0);
      if (!$amt) continue;

      foreach ($result as $rid => $val) {
        if (!res_scope_matches($scope, $rid)) continue;
        if ($op === 'adds') $result[$rid] = $val + $amt;
        if ($op === 'subt') $result[$rid] = max(0, $val - $amt);
      }
    }

    // mult
    foreach ($buffs as $b) {
      if (($b['kind'] ?? '') !== 'res') continue;
      $mode = $b['mode'] ?? 'both';
      if ($mode !== 'yield' && $mode !== 'both') continue;
      if (($b['op'] ?? $b['type'] ?? '') !== 'mult') continue;
      if (!ctx_matches($b['applies_to'] ?? 'all', $ctxId)) continue;
      $scope = $b['scope'] ?? ($b['id'] ?? 'all');
      $pct = (float)($b['amount'] ?? 0);
      if (!$pct) continue;

      foreach ($result as $rid => $val) {
        if (!res_scope_matches($scope, $rid)) continue;
        $mul = 1 + $pct / 100;
        $result[$rid] = max(0, $val * $mul);
      }
    }

    foreach ($result as $rid => $val) {
      if ($val < 0) $result[$rid] = 0;
    }
    return $result;
  }
}