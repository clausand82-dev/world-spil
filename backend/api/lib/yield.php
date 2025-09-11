<?php
declare(strict_types=1);

/**
 * yield.php — passiv yield motor
 * Håndterer nu BÅDE bygninger og addons via to separate, sikre forespørgsler.
 */

require_once __DIR__ . '/../_init.php';
require_once __DIR__ . '/purchase_helpers.php';

if (!function_exists('canonical_res_id')) {
  function canonical_res_id(string $rid): string {
    $rid = trim($rid);
    return str_starts_with($rid, 'res.') ? $rid : 'res.' . $rid;
  }
}

/**
 * Kør passiv yield for alle aktive producenter (bygninger OG addons) for en bruger.
 *
 * @return array {summary: [...], updated: n}
 */
function apply_passive_yields_for_user(int $userId): array {
  $db   = db();
  
  if (!function_exists('load_all_defs')) {
      require_once __DIR__ . '/../api/alldata.php';
  }
  $defs = load_all_defs();

  $ownTxn = !$db->inTransaction();
  if ($ownTxn) $db->beginTransaction();

  try {
    $summary = [];
    $updated = 0;
    $allProducers = [];

    // =====================================================================
    // START PÅ RETTELSE: Brug to separate, sikre forespørgsler.
    // =====================================================================
    
    // 1) Hent og lås bygninger
    $stmtBuildings = $db->prepare("
      SELECT id, bld_id AS item_id, last_yield_ts_utc, 'buildings' AS table_name
        FROM buildings
       WHERE user_id = ? AND yield_enabled = 1
       FOR UPDATE
    ");
    $stmtBuildings->execute([$userId]);
    $buildingRows = $stmtBuildings->fetchAll(PDO::FETCH_ASSOC);

    // 2) Hent og lås addons
    $stmtAddons = $db->prepare("
      SELECT id, add_id AS item_id, last_yield_ts_utc, 'addon' AS table_name
        FROM addon
       WHERE user_id = ? AND yield_enabled = 1
       FOR UPDATE
    ");
    $stmtAddons->execute([$userId]);
    $addonRows = $stmtAddons->fetchAll(PDO::FETCH_ASSOC);

    // 3) Saml resultaterne i ét array
    $allProducers = array_merge($buildingRows, $addonRows);
    
    // =====================================================================
    // SLUT PÅ RETTELSE
    // =====================================================================

    $nowUtc = new DateTimeImmutable('now', new DateTimeZone('UTC'));

    foreach ($allProducers as $r) {
      $itemId = (string)$r['item_id'];
      $tableName = (string)$r['table_name'];
      
      $parts = explode('.', $itemId, 2);
      $scope = $parts[0]; // 'bld' eller 'add'
      $key   = $parts[1];

      $def = $defs[$scope][$key] ?? null;
      if (!$def) continue;

      $periodS = (int)($def['yield_period_s'] ?? 0);
      $lines   = $def['yield'] ?? [];
      if ($periodS <= 0 || empty($lines)) continue;

      $last = $r['last_yield_ts_utc'] ? new DateTimeImmutable((string)$r['last_yield_ts_utc'], new DateTimeZone('UTC')) : null;

      if ($last === null) {
        $db->prepare("UPDATE {$tableName} SET last_yield_ts_utc = UTC_TIMESTAMP() WHERE id = ?")->execute([$r['id']]);
        continue;
      }
      
      if ($nowUtc <= $last) continue;

      $elapsed = $nowUtc->getTimestamp() - $last->getTimestamp();
      $cycles  = intdiv($elapsed, $periodS);
      if ($cycles <= 0) continue;

      $cycles = min($cycles, 10000); // Throttle

      $credited = [];
      foreach ($lines as $ln) {
        $resId  = (string)($ln['id'] ?? $ln['res_id'] ?? '');
        $amount = (float)($ln['amount'] ?? 0);
        if ($resId === '' || $amount <= 0) continue;

        $resIdCanon = canonical_res_id($resId);
        $out = $cycles * $amount;
        
        if ($out > 0) {
          credit_inventory($db, $defs, $userId, $resIdCanon, $out);
          $credited[] = ['res_id' => $resIdCanon, 'amount' => $out];
        }
      }

      if (!empty($credited)) {
        $advanceS = $cycles * $periodS;
        $updateSql = "
          UPDATE {$tableName}
             SET last_yield_ts_utc = DATE_ADD(last_yield_ts_utc, INTERVAL ? SECOND),
                 yield_cycles_total = COALESCE(yield_cycles_total, 0) + ?
           WHERE id = ? AND user_id = ?
        ";
        $db->prepare($updateSql)->execute([$advanceS, $cycles, $r['id'], $userId]);

        $summary[] = [
          'item_id'  => $itemId,
          'cycles'   => $cycles,
          'credited' => $credited
        ];
        $updated++;
      }
    }

    if ($ownTxn) $db->commit();
    return ['summary' => $summary, 'updated' => $updated];

  } catch (Throwable $e) {
    if ($ownTxn && $db->inTransaction()) $db->rollBack();
    throw $e;
  }
}

/** 
 * Skriver til en samlet `inventory`-tabel.
 */
function credit_inventory(PDO $db, array $defs, int $userId, string $resId, float $amount): void {
  if ($amount <= 0) return;
  $rid = canonical_res_id($resId);

  $sql = "INSERT INTO inventory (user_id, res_id, amount)
          VALUES (?, ?, ?)
          ON DUPLICATE KEY UPDATE amount = amount + VALUES(amount)";
  $db->prepare($sql)->execute([$userId, $rid, $amount]);
}