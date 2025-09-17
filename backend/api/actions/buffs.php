<?php
// ---- utils ----
function ctx_matches($applies_to, $ctx_id) {
  if ($applies_to === 'all') return true;
  $arr = is_array($applies_to) ? $applies_to : [$applies_to];
  if (in_array($ctx_id, $arr, true)) return true;
  if (str_starts_with($ctx_id, 'bld.') && in_array('buildings', $arr, true)) return true;
  if (str_starts_with($ctx_id, 'add.') && in_array('addons', $arr, true))    return true;
  if (str_starts_with($ctx_id, 'rsd.') && in_array('research', $arr, true))  return true;
  if (str_starts_with($ctx_id, 'rcp.') && in_array('recipes', $arr, true))   return true;
  return false;
}
function is_buff_in_window($buff, $now) {
  if (isset($buff['start_ts']) && $now < (int)$buff['start_ts']) return false;
  if (isset($buff['end_ts'])   && $now > (int)$buff['end_ts'])   return false;
  return true;
}

// Ejer-check: kun buffs fra kilder spilleren faktisk har
function is_source_owned($source_id, $state) {
  if (!$source_id) return true;
  if (str_starts_with($source_id, 'rsd.')) {
    $k = preg_replace('/^rsd\./','', $source_id);
    return !empty($state['rsd'][$k]) || !empty($state['research'][$k]) || !empty($state['rsd'][$source_id]);
  }
  if (str_starts_with($source_id, 'bld.')) {
    return !empty($state['bld'][$source_id]);
  }
  if (str_starts_with($source_id, 'add.')) {
    return !empty($state['add'][$source_id]);
  }
  // ellers: antag aktiv
  return true;
}

// Saml aktive buffs ud fra defs + state
function collect_active_buffs($defs, $state, $now=null) {
  if ($now === null) $now = time();
  $out = [];
  foreach (['bld','add','rsd'] as $bucket) {
    if (empty($defs[$bucket])) continue;
    foreach ($defs[$bucket] as $id => $def) {
      if (empty($def['buffs'])) continue;
      foreach ($def['buffs'] as $b) {
        if (!is_buff_in_window($b, $now)) continue;
        if (!is_source_owned($b['source_id'] ?? $id, $state)) continue;
        $out[] = $b;
      }
    }
  }
  return $out;
}

// ---- COST (resources) ----
// $baseCost assoc: ['res.money'=>100,'res.wood'=>25,...]
function apply_cost_buffs(array $baseCost, string $ctx_id, array $buffs): array {
  $result = $baseCost;

  // 1) adds/subt per res
  foreach ($buffs as $b) {
    if (($b['kind'] ?? '') !== 'res') continue;
    $mode = $b['mode'] ?? 'both';
    if ($mode !== 'cost' && $mode !== 'both') continue;
    if (!ctx_matches($b['applies_to'] ?? 'all', $ctx_id)) continue;

    foreach ($result as $rid => $amt) {
      if (!res_scope_matches($b['scope'] ?? 'all', $rid)) continue;
      if (($b['op'] ?? '') === 'adds') $result[$rid] = max(0, $amt + (float)$b['amount']);
      if (($b['op'] ?? '') === 'subt') $result[$rid] = max(0, $amt - (float)$b['amount']);
    }
  }

  // 2) mult (procenter) – cost = billigere ved positivt amount
  foreach ($buffs as $b) {
    if (($b['kind'] ?? '') !== 'res') continue;
    $mode = $b['mode'] ?? 'both';
    if ($mode !== 'cost' && $mode !== 'both') continue;
    if (($b['op'] ?? '') !== 'mult') continue;
    if (!ctx_matches($b['applies_to'] ?? 'all', $ctx_id)) continue;

    $p = max(0.0, (float)$b['amount']) / 100.0;
    $mult = max(0.0, 1.0 - $p);
    foreach ($result as $rid => $amt) {
      if (!res_scope_matches($b['scope'] ?? 'all', $rid)) continue;
      $result[$rid] = max(0, $amt * $mult);
    }
  }

  // afrund / normaliser
  foreach ($result as $rid => $amt) {
    // hvis du bruger heltal i DB:
    $result[$rid] = (int)round($amt);
  }
  return $result;
}

function res_scope_matches($scope, $res_id) {
  if ($scope === 'all') return true;
  if ($scope === $res_id) return true;
  if ($scope === 'solid' || $scope === 'liquid') {
    // TODO: hvis du kan skelne solid/liquid pr res_id, indsæt din logik her.
    return true; // midlertidigt: accepter
  }
  return false;
}

// ---- SPEED (duration) ----
function apply_speed_buffs($baseS, string $action, string $ctx_id, array $buffs) {
  $mult = 1.0;
  foreach ($buffs as $b) {
    if (($b['kind'] ?? '') !== 'speed') continue;
    if (!ctx_matches($b['applies_to'] ?? 'all', $ctx_id)) continue;

    $acts = $b['actions'] ?? 'all';
    $okAction = ($acts === 'all') || (is_array($acts) && in_array($action, $acts, true));
    if (!$okAction) continue;

    if (($b['op'] ?? '') === 'mult') {
      $p = max(0.0, (float)$b['amount']) / 100.0;
      $mult *= max(0.0, 1.0 - $p);
    }
  }
  // cap: max 80% hurtigere → mult >= 0.2
  $mult = max(0.2, $mult);
  return max(0, (int)round($baseS * $mult));
}
