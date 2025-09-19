<?php
declare(strict_types=1);

require_once __DIR__ . '/../_init.php';
require_once __DIR__ . '/event_log.php';

if (!function_exists('canonical_res_id')) {
  function canonical_res_id(string $rid): string {
    $rid = trim($rid);
    return str_starts_with($rid, 'res.') ? $rid : 'res.' . $rid;
  }
}

/**
 * Hent alle defs (bruger samme XML-loadere som alldata).
 * Vi bevarer nøglerne som de er i XML (ofte 'res.xxx').
 */
function _yield_load_all_defs(): array {
  static $defs = null;
  if ($defs !== null) return $defs;

  $cfg    = load_config_ini();
  $xmlDir = resolve_dir((string)($cfg['dirs']['xml_dir'] ?? ''), 'data/xml');

  $defs = ['res' => [], 'bld' => [], 'rsd' => [], 'rcp' => [], 'add' => [], 'ani' => []];

  $rii = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($xmlDir, FilesystemIterator::SKIP_DOTS));
  foreach ($rii as $fileInfo) {
    if (!$fileInfo->isFile() || strtolower($fileInfo->getExtension()) !== 'xml') continue;
    $path = $fileInfo->getPathname();
    $xml  = @simplexml_load_file($path);
    if (!$xml) continue;

    if ($xml->xpath('//resource')) $defs['res'] = array_merge($defs['res'], load_resources_xml($path));
    if ($xml->xpath('//building')) $defs['bld'] = array_merge($defs['bld'], load_buildings_xml($path));
    if ($xml->xpath('//addon'))    $defs['add'] = array_merge($defs['add'], load_addons_xml($path));
    if ($xml->xpath('//animal'))   $defs['ani'] = array_merge($defs['ani'], load_animals_xml($path));
    if ($xml->xpath('//recipe'))   $defs['rcp'] = array_merge($defs['rcp'], load_recipes_xml($path));
    if ($xml->xpath('//research')) $defs['rsd'] = array_merge($defs['rsd'], load_research_xml($path));
  }

  return $defs;
}

/** Returnér defs.res for et givent res-id (tåler 'water' / 'res.water'). */
function _res_def(array $defsRes, string $idOrBare): ?array {
  if (isset($defsRes[$idOrBare])) return $defsRes[$idOrBare];
  $canon = str_starts_with($idOrBare, 'res.') ? $idOrBare : "res.$idOrBare";
  if (isset($defsRes[$canon])) return $defsRes[$canon];
  $bare  = preg_replace('/^res\./', '', $canon);
  return $defsRes[$bare] ?? null;
}

/** 'l' => liquid, alt andet => solid */
function _res_type(array $defsRes, string $idOrBare): string {
  $def = _res_def($defsRes, $idOrBare);
  $unit = strtolower((string)($def['unit'] ?? ''));
  return $unit === 'l' ? 'liquid' : 'solid';
}

/** unitSpace for ressource (0.0 default) */
function _res_space(array $defsRes, string $idOrBare): float {
  $def = _res_def($defsRes, $idOrBare);
  return (float)($def['unitSpace'] ?? 0.0);
}

/** Udregn caps og 'used' fra inventory (samme princip som i alldata). */
function _compute_caps_and_used(PDO $db, array $defs, int $userId): array {
  $cfg = load_config_ini();

  $liquidBase = (int)(
    $cfg['start_limitations_cap']['storageLiquidCap']
    ?? $cfg['start_limitations_cap']['storageLiquidBaseCap']
    ?? 0
  );
  $solidBase = (int)(
    $cfg['start_limitations_cap']['storageSolidCap']
    ?? $cfg['start_limitations_cap']['storageSolidBaseCap']
    ?? 0
  );

  $bonusLiquid = 0;
  $bonusSolid  = 0;

  $usedLiquid = 0.0;
  $usedSolid  = 0.0;

  $st = $db->prepare("SELECT res_id, amount FROM inventory WHERE user_id = ?");
  $st->execute([$userId]);
  foreach ($st->fetchAll(PDO::FETCH_ASSOC) as $row) {
    $rid = (string)$row['res_id'];
    $amt = (float)$row['amount'];
    $type  = _res_type($defs['res'], $rid);
    $space = _res_space($defs['res'], $rid);
    if ($type === 'liquid') $usedLiquid += $amt * $space;
    else                    $usedSolid  += $amt * $space;
  }

  $totLiquid = $liquidBase + $bonusLiquid;
  $totSolid  = $solidBase + $bonusSolid;

  return [
    'liquid' => ['base'=>$liquidBase, 'bonus'=>$bonusLiquid, 'total'=>$totLiquid, 'used'=>$usedLiquid, 'available'=>max(0.0, $totLiquid - $usedLiquid)],
    'solid'  => ['base'=>$solidBase,  'bonus'=>$bonusSolid,  'total'=>$totSolid,  'used'=>$usedSolid,  'available'=>max(0.0, $totSolid  - $usedSolid)],
  ];
}

/**
 * PASSIVE yields med cap-håndhævelse og logging af 'yield_lost'.
 */
function apply_passive_yields_for_user(int $userId): array {
  $db   = db();
  $defs = _yield_load_all_defs();

  $ownTxn = !$db->inTransaction();
  if ($ownTxn) $db->beginTransaction();

  try {
    $summary = [];
    $updated = 0;
    $nowUtc  = new DateTimeImmutable('now', new DateTimeZone('UTC'));

    // 1) Lås producenter
    $stmtB = $db->prepare("SELECT id, bld_id AS item_id, 1 AS quantity, last_yield_ts_utc, 'buildings' AS table_name FROM buildings WHERE user_id = ? AND yield_enabled = 1 FOR UPDATE");
    $stmtA = $db->prepare("SELECT id, add_id AS item_id, 1 AS quantity, last_yield_ts_utc, 'addon'     AS table_name FROM addon     WHERE user_id = ? AND yield_enabled = 1 FOR UPDATE");
    $stmtN = $db->prepare("SELECT id, ani_id AS item_id, quantity, last_yield_ts_utc, 'animals'   AS table_name FROM animals   WHERE user_id = ? AND yield_enabled = 1 FOR UPDATE");

    $stmtB->execute([$userId]); $rowsB = $stmtB->fetchAll(PDO::FETCH_ASSOC);
    $stmtA->execute([$userId]); $rowsA = $stmtA->fetchAll(PDO::FETCH_ASSOC);
    $stmtN->execute([$userId]); $rowsN = $stmtN->fetchAll(PDO::FETCH_ASSOC);

    $producers = array_merge($rowsB, $rowsA, $rowsN);
    if (empty($producers)) { if ($ownTxn) $db->commit(); return ['summary'=>[], 'updated'=>0]; }

    // 2) Saml potentielle yield-linjer
    $candidates = []; // hver: itemId, table, pk, resId, units, unitSpace, type
    $advanceMap = []; // itemId => ['table','pk','advanceS','cycles']

    foreach ($producers as $r) {
      $itemId   = (string)$r['item_id'];
      $table    = (string)$r['table_name'];
      $quantity = (int)$r['quantity'];

      [$scope, $key] = array_pad(explode('.', $itemId, 2), 2, '');
      $defScope = ($scope === 'animals') ? 'ani' : $scope;
      $defItem  = $defs[$defScope][$key] ?? null;
      if (!$defItem) continue;

      $periodS = (int)($defItem['yield_period_s'] ?? 0);
      $lines   = $defItem['yield'] ?? [];
      if ($periodS <= 0 || empty($lines) || $quantity <= 0) continue;

      $last = $r['last_yield_ts_utc'] ? new DateTimeImmutable((string)$r['last_yield_ts_utc'], new DateTimeZone('UTC')) : null;
      if ($last === null) {
        $db->prepare("UPDATE {$table} SET last_yield_ts_utc = UTC_TIMESTAMP() WHERE id = ?")->execute([(int)$r['id']]);
        continue;
      }
      if ($nowUtc <= $last) continue;

      $elapsed = $nowUtc->getTimestamp() - $last->getTimestamp();
      $cycles  = intdiv($elapsed, $periodS);
      if ($cycles <= 0) continue;
      $cycles = min($cycles, 10000);

      $advanceMap[$itemId] = [
        'table'    => $table,
        'pk'       => (int)$r['id'],
        'advanceS' => $cycles * $periodS,
        'cycles'   => $cycles,
      ];

      foreach ($lines as $ln) {
        $ridRaw = (string)($ln['id'] ?? $ln['res_id'] ?? '');
        $amt    = (float)($ln['amount'] ?? 0);
        if ($ridRaw === '' || $amt <= 0) continue;

        $units = $cycles * $amt * max(1, $quantity);
        if ($units <= 0) continue;

        $ridCanon  = canonical_res_id($ridRaw);
        $type      = _res_type($defs['res'], $ridCanon);
        $unitSpace = _res_space($defs['res'], $ridCanon);

        $candidates[] = [
          'itemId'     => $itemId,
          'table'      => $table,
          'pk'         => (int)$r['id'],
          'resId'      => $ridCanon,
          'units'      => (float)$units,
          'unitSpace'  => (float)$unitSpace,
          'type'       => $type, // 'liquid' | 'solid'
        ];
      }
    }

    if (empty($advanceMap)) { if ($ownTxn) $db->commit(); return ['summary'=>[], 'updated'=>0]; }

    // 3) Udregn cap og available
    $caps = _compute_caps_and_used($db, $defs, $userId);
    $available = [
      'liquid' => (float)$caps['liquid']['available'],
      'solid'  => (float)$caps['solid']['available'],
    ];

    // 4) Fordel og log
    $creditedByRes = []; // resId => units sum
    $perItemPaid   = []; // itemId => [{res_id, amount}]
    $perItemLost   = []; // itemId => [{res_id, amount, reason}]

    // Gratis ressourcer (unitSpace <= 0) krediteres fuldt
    foreach ($candidates as $cl) {
      if ($cl['unitSpace'] > 0) continue;
      $u = $cl['units'];
      if ($u <= 0) continue;
      $creditedByRes[$cl['resId']] = ($creditedByRes[$cl['resId']] ?? 0) + $u;
      $perItemPaid[$cl['itemId']][] = ['res_id' => $cl['resId'], 'amount' => $u];
    }

    // Pladskrævende fordeles pr. type: sortér efter unitSpace DESC (fylder mest først), tie: units DESC
    $spaceLines = array_values(array_filter($candidates, fn($x) => $x['unitSpace'] > 0 && in_array($x['type'], ['liquid','solid'], true)));
    $byType = ['liquid'=>[], 'solid'=>[]];
    foreach ($spaceLines as $cl) $byType[$cl['type']][] = $cl;
    foreach (['liquid','solid'] as $t) {
      usort($byType[$t], function($a,$b){
        if ($a['unitSpace'] === $b['unitSpace']) return ($b['units'] <=> $a['units']);
        return ($b['unitSpace'] <=> $a['unitSpace']);
      });

      $avail = $available[$t];
      if ($avail <= 0) {
        // alt tabes for denne type
        foreach ($byType[$t] as $cl) {
          if ($cl['units'] <= 0) continue;
          $perItemLost[$cl['itemId']][] = ['res_id'=>$cl['resId'], 'amount'=>$cl['units'], 'reason'=>"Yield tabt pga. ingen plads ($t)"];
        }
        continue;
      }

      foreach ($byType[$t] as $cl) {
        $uSpace = $cl['unitSpace'];
        $units  = $cl['units'];
        if ($units <= 0) continue;

        $maxFit = ($uSpace > 0) ? floor($avail / $uSpace) : $units;
        $payU   = (float)max(0, min($units, $maxFit));
        $lostU  = $units - $payU;

        if ($payU > 0) {
          $creditedByRes[$cl['resId']] = ($creditedByRes[$cl['resId']] ?? 0) + $payU;
          $perItemPaid[$cl['itemId']][] = ['res_id' => $cl['resId'], 'amount' => $payU];
          $avail -= $payU * $uSpace;
        }
        if ($lostU > 0) {
          $perItemLost[$cl['itemId']][] = ['res_id'=>$cl['resId'], 'amount'=>$lostU, 'reason'=>"Yield tabt pga. ingen plads ($t)"];
        }
        if ($avail <= 0) $avail = 0.0;
      }
      $available[$t] = $avail;
    }

    // 5) Kreditér inventory aggregeret pr. res
    foreach ($creditedByRes as $rid => $amt) {
      if ($amt <= 0) continue;
      $sql = "INSERT INTO inventory (user_id, res_id, amount)
              VALUES (?, ?, ?)
              ON DUPLICATE KEY UPDATE amount = amount + VALUES(amount)";
      $db->prepare($sql)->execute([$userId, $rid, $amt]);
    }

    // 6) Log pr. item (paid + lost) og fremryk tid ALTID
    foreach ($advanceMap as $itemId => $p) {
      $paid = array_values($perItemPaid[$itemId] ?? []);
      $lost = array_values($perItemLost[$itemId] ?? []);

      if (!empty($paid)) log_yield_paid($db, $userId, $itemId, $paid);
      if (!empty($lost)) log_yield_lost($db, $userId, $itemId, $lost);

      $db->prepare("
        UPDATE {$p['table']}
           SET last_yield_ts_utc = DATE_ADD(last_yield_ts_utc, INTERVAL ? SECOND),
               yield_cycles_total = COALESCE(yield_cycles_total, 0) + ?
         WHERE id = ? AND user_id = ?
      ")->execute([$p['advanceS'], $p['cycles'], $p['pk'], $userId]);

      $summary[] = [
        'item_id' => $itemId,
        'cycles'  => $p['cycles'],
        'credited'=> $paid,
        'lost'    => $lost,
      ];
      $updated++;
    }

    if ($ownTxn) $db->commit();
    return ['summary'=>$summary, 'updated'=>$updated];

  } catch (Throwable $e) {
    if ($ownTxn && $db->inTransaction()) $db->rollBack();
    throw $e;
  }
}