<?php
declare(strict_types=1);

require_once __DIR__ . '/management_policies.php';     // management_compute_effects
require_once __DIR__ . '/management_effects_apply.php';

// Læs overrides for bruger → compute → apply
function apply_user_policies_to_summary(PDO $pdo, int $userId, array &$summary): void {
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

  $effects = management_compute_effects($summary, $overridesByFamily);
  management_apply_effects($summary, $effects);
}