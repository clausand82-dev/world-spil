<?php
declare(strict_types=1);

require_once __DIR__ . '/management_policies.php';     // management_compute_effects
require_once __DIR__ . '/management_effects_apply.php';

// Læs overrides for bruger → compute → apply
function apply_user_policies_to_summary(PDO $pdo, int $userId, array &$summary): void {

  // --- Ensure summary has state BEFORE any early return ---
  $summary['state'] = $summary['state'] ?? build_player_state_from_db($pdo, $userId);

  $st = $pdo->prepare('SELECT family, field_key, value_json FROM user_management_choices WHERE user_id = ?');
  $st->execute([$userId]);
  $overridesByFamily = [];
  while ($row = $st->fetch(PDO::FETCH_ASSOC)) {
    $fam = (string)$row['family'];
    $key = (string)$row['field_key'];
    $val = json_decode((string)$row['value_json'], true);
    if (!isset($overridesByFamily[$fam])) $overridesByFamily[$fam] = [];
    $overridesByFamily[$fam][$key] = $val;
  }
  if (empty($overridesByFamily)) return;

  $summary['state'] = $summary['state'] ?? build_player_state_from_db($pdo, $userId);

  $effects = management_compute_effects($summary, $overridesByFamily);
  management_apply_effects($summary, $effects);

}

function build_player_state_from_db(PDO $pdo, int $userId): array {
  $state = ['bld' => [], 'add' => [], 'rsd' => []];

  $trySelect = function(string $sql, array $params = []) use ($pdo) {
    try {
      $st = $pdo->prepare($sql);
      $st->execute($params);
      return $st->fetchAll(PDO::FETCH_ASSOC);
    } catch (\Throwable $e) {
      return [];
    }
  };

  $candidates = [
    'bld' => [
      ["sql" => "SELECT `bld_id` AS id, `level` AS level FROM buildings WHERE user_id = ?", "params" => [$userId]],

    ],
    'add' => [
      ["sql" => "SELECT `add_id` AS id, `level` AS level FROM addon WHERE user_id = ?", "params" => [$userId]],
    ],
    'rsd' => [
      ["sql" => "SELECT `rsd_id` AS id, `level` AS level FROM research WHERE user_id = ?", "params" => [$userId]],

    ],
  ];

  foreach ($candidates as $domain => $list) {
    foreach ($list as $c) {
      $rows = $trySelect($c['sql'], $c['params']);
      if (empty($rows)) continue;
      foreach ($rows as $r) {
        $rawId = (string)($r['id'] ?? '');
        if ($rawId === '') continue;

        // Normalize id: strip any leading domain prefix and trailing .lN suffix
        // Examples:
        //  - "bld.basecamp.l3" -> "basecamp"
        //  - "basecamp.l3"     -> "basecamp"
        //  - "bld.bld.basecamp.13.13" -> attempt to recover "basecamp"
        $clean = $rawId;
        // remove leading domain. or domain.domain. prefixes
        $clean = preg_replace('/^(?:' . preg_quote($domain, '/') . '\.)+/i', '', $clean);
        // remove trailing .lN or .<number> suffixes
        $clean = preg_replace('/(\.l?\d+)+$/i', '', $clean);
        $clean = trim($clean, '.');

        // determine level: prefer numeric column, else try parse from raw id suffix .lN
        $lvl = 1;
        if (isset($r['level']) && is_numeric($r['level'])) {
          $lvl = (int)$r['level'];
        } elseif (preg_match('/\.l(\d+)$/', $rawId, $m)) {
          $lvl = (int)$m[1];
        } elseif (preg_match('/\.(\d+)$/', $rawId, $m2)) {
          $lvl = (int)$m2[1];
        }

        // set canonical entries: simple id and domain-prefixed .lN key
        $state[$domain][$clean] = ['level' => max($state[$domain][$clean]['level'] ?? 0, $lvl)];
        $state[$domain]["{$domain}.{$clean}.l{$lvl}"] = ['level' => $lvl];
      }
      // stop after first candidate that returned rows
      break;
    }
  }

  return $state;
}