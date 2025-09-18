<?php
declare(strict_types=1);

require_once __DIR__ . '/../_init.php';
require_once __DIR__ . '/purchase_helpers.php';
require_once __DIR__ . '/event_log.php';

// =====================================================================
// SECTION: LOKALE HJÆLPEFUNKTIONER (for at gøre filen selvstændig)
// =====================================================================

/**
 * Privat funktion til at hente alle defs.
 * En sikker, isoleret kopi af logikken fra alldata.php.
 */
function _yield_load_all_defs(): array {
    static $defs = null;
    if ($defs !== null) return $defs;

    // Disse funktioner skal være tilgængelige via _init.php
    $cfg = load_config_ini();
    $xmlDir = resolve_dir((string)($cfg['dirs']['xml_dir'] ?? ''), 'data/xml');

    $defs = ['res' => [], 'bld' => [], 'rsd' => [], 'rcp' => [], 'add' => [], 'ani' => []];
    $rii = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($xmlDir, FilesystemIterator::SKIP_DOTS));
    
    foreach ($rii as $fileInfo) {
        if (!$fileInfo->isFile() || strtolower($fileInfo->getExtension()) !== 'xml') continue;
        $path = $fileInfo->getPathname();
        if (str_contains($path, 'animal')) $defs['ani'] = array_merge($defs['ani'], load_animals_xml($path));
        elseif (str_contains($path, 'addon')) $defs['add'] = array_merge($defs['add'], load_addons_xml($path));
        elseif (str_contains($path, 'building')) $defs['bld'] = array_merge($defs['bld'], load_buildings_xml($path));
        elseif (str_contains($path, 'research')) $defs['rsd'] = array_merge($defs['rsd'], load_research_xml($path));
        elseif (str_contains($path, 'recipe')) $defs['rcp'] = array_merge($defs['rcp'], load_recipes_xml($path));
        elseif (str_contains($path, 'resource')) $defs['res'] = array_merge($defs['res'], load_resources_xml($path));
    }

    if (!empty($defs['res'])) {
        $norm = [];
        foreach ($defs['res'] as $id => $row) $norm[strip_prefix($id, 'res')] = $row;
        $defs['res'] = $norm;
    }

    return $defs;
}


if (!function_exists('canonical_res_id')) {
  function canonical_res_id(string $rid): string {
    $rid = trim($rid);
    return str_starts_with($rid, 'res.') ? $rid : 'res.' . $rid;
  }
}

/**
 * Kør passiv yield for alle aktive producenter (bygninger, addons, dyr).
 */
function apply_passive_yields_for_user(int $userId): array {
  $db = db();
  $defs = _yield_load_all_defs(); // Bruger den nye, sikre lokale funktion

  $ownTxn = !$db->inTransaction();
  if ($ownTxn) $db->beginTransaction();

  try {
    $summary = [];
    $updated = 0;

    $stmtBuildings = $db->prepare("SELECT id, bld_id AS item_id, 1 AS quantity, last_yield_ts_utc, 'buildings' AS table_name FROM buildings WHERE user_id = ? AND yield_enabled = 1 FOR UPDATE");
    $stmtBuildings->execute([$userId]);
    $buildingRows = $stmtBuildings->fetchAll(PDO::FETCH_ASSOC);

    $stmtAddons = $db->prepare("SELECT id, add_id AS item_id, 1 AS quantity, last_yield_ts_utc, 'addon' AS table_name FROM addon WHERE user_id = ? AND yield_enabled = 1 FOR UPDATE");
    $stmtAddons->execute([$userId]);
    $addonRows = $stmtAddons->fetchAll(PDO::FETCH_ASSOC);

    $stmtAnimals = $db->prepare("SELECT id, ani_id AS item_id, quantity, last_yield_ts_utc, 'animals' AS table_name FROM animals WHERE user_id = ? AND yield_enabled = 1 FOR UPDATE");
    $stmtAnimals->execute([$userId]);
    $animalRows = $stmtAnimals->fetchAll(PDO::FETCH_ASSOC);

    $allProducers = array_merge($buildingRows, $addonRows, $animalRows);
    
    $nowUtc = new DateTimeImmutable('now', new DateTimeZone('UTC'));

    foreach ($allProducers as $r) {
      $itemId = (string)$r['item_id'];
      $tableName = (string)$r['table_name'];
      $quantity = (int)$r['quantity'];
      
      $parts = explode('.', $itemId, 2);
      $scope = $parts[0];
      $key   = $parts[1];

      // Defs nøglen for 'animals' er 'ani', ikke 'animals'
      $def_scope = ($scope === 'animals') ? 'ani' : $scope;
      $def = $defs[$def_scope][$key] ?? null;

      if (!$def) continue;

      $periodS = (int)($def['yield_period_s'] ?? 0);
      $lines   = $def['yield'] ?? [];
      if ($periodS <= 0 || empty($lines) || $quantity <= 0) continue;

      $last = $r['last_yield_ts_utc'] ? new DateTimeImmutable((string)$r['last_yield_ts_utc'], new DateTimeZone('UTC')) : null;

      if ($last === null) {
        $db->prepare("UPDATE {$tableName} SET last_yield_ts_utc = UTC_TIMESTAMP() WHERE id = ?")->execute([$r['id']]);
        continue;
      }
      
      if ($nowUtc <= $last) continue;

      $elapsed = $nowUtc->getTimestamp() - $last->getTimestamp();
      $cycles  = intdiv($elapsed, $periodS);
      if ($cycles <= 0) continue;

      $cycles = min($cycles, 10000);

      $credited = [];
      foreach ($lines as $ln) {
        $resId  = (string)($ln['id'] ?? $ln['res_id'] ?? '');
        $amount = (float)($ln['amount'] ?? 0);
        if ($resId === '' || $amount <= 0) continue;

        $resIdCanon = canonical_res_id($resId);
        $out = $cycles * $amount * $quantity;
        
        if ($out > 0) {
          credit_inventory($db, $defs, $userId, $resIdCanon, $out);
          $credited[] = ['res_id' => $resIdCanon, 'amount' => $out];
        }
      }

      if (!empty($credited)) {
      // Log én hændelse pr. item med alle ressource-linjer i payload
      log_yield_paid($db, $userId, $itemId, $credited);
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
        $summary[] = [ 'item_id' => $itemId, 'cycles' => $cycles, 'credited' => $credited, 'quantity' => $quantity ];
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

function credit_inventory(PDO $db, array $defs, int $userId, string $resId, float $amount): void {
  if ($amount <= 0) return;
  $rid = canonical_res_id($resId);

  $sql = "INSERT INTO inventory (user_id, res_id, amount)
          VALUES (?, ?, ?)
          ON DUPLICATE KEY UPDATE amount = amount + VALUES(amount)";
  $db->prepare($sql)->execute([$userId, $rid, $amount]);
}