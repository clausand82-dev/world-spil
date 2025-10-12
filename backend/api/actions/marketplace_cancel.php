<?php
declare(strict_types=1);
require_once __DIR__ . '/../_init.php';
if (session_status() !== PHP_SESSION_ACTIVE) session_start();
header('Content-Type: application/json; charset=utf-8');

/**
 * 10% straf ved annullering. Sæt til 0.0 for at slå fra.
 */
const CANCEL_PENALTY_PCT = 0.10;

/**
 * Find XML-filer (tilpas stierne hvis nødvendigt).
 */
function find_xml_path(string $kind): ?string {
  $root = realpath(__DIR__ . '/../../..') ?: (__DIR__ . '/../../..');
  $map = [
    'resources' => [
      $root . '/backend/data/xml/resource.xml',
      $root . '/backend/data/defs/resource.xml',
      $root . '/data/xml/resource.xml',
      $root . '/data/defs/resource.xml',
    ],
    'buildings' => [
      $root . '/backend/data/xml/building.xml',
      $root . '/backend/data/defs/building.xml',
      $root . '/data/xml/building.xml',
      $root . '/data/defs/building.xml',
    ],
    'addon' => [
      $root . '/backend/data/xml/addon.xml',
      $root . '/backend/data/defs/addon.xml',
      $root . '/data/xml/addon.xml',
      $root . '/data/defs/addon.xml',
    ],
    'research' => [
      $root . '/backend/data/xml/research.xml',
      $root . '/backend/data/defs/research.xml',
      $root . '/data/xml/research.xml',
      $root . '/data/defs/research.xml',
    ],
    'animals' => [
      $root . '/backend/data/xml/animal.xml',
      $root . '/backend/data/defs/animal.xml',
      $root . '/data/xml/animal.xml',
      $root . '/data/defs/animal.xml',
    ],
  ];
  $candidates = $map[$kind] ?? [];
  foreach ($candidates as $p) {
    if (is_file($p)) return $p;
  }
  return null;
}

function load_xml_or_null(string $path): ?SimpleXMLElement {
  libxml_use_internal_errors(true);
  $xml = @simplexml_load_file($path);
  return $xml ?: null;
}

/**
 * Slår unitSpace op for et res_id i resources.xml
 */
function xml_read_unit_space(string $resId): ?float {
  $rp = find_xml_path('resources');
  if (!$rp) return null;
  $xml = load_xml_or_null($rp);
  if (!$xml) return null;
  foreach ($xml->xpath('//resource[@id]') ?: [] as $node) {
    if ((string)$node['id'] === $resId) {
      if (isset($node->unitSpace)) {
        $v = (float)$node->unitSpace;
        return ($v > 0) ? $v : null;
      }
      break;
    }
  }
  return null;
}

/**
 * Læs en kapacitets-stat-værdi fra en node.
 * Vi forsøger flere formater:
 *  - Direkte child <storageSolidCap>123</storageSolidCap>
 *  - Indeni <stats> som subelementer (samme)
 *  - Indeni <stats> som tekst "k=v; k2=v2"
 */
function xml_stat_value_from_node(SimpleXMLElement $node, array $keys): float {
  // Direkte childs
  foreach ($keys as $k) {
    if (isset($node->{$k})) {
      $v = (float)$node->{$k};
      if ($v !== 0.0) return $v;
    }
  }
  // Under <stats> som child elements
  if (isset($node->stats)) {
    foreach ($keys as $k) {
      if (isset($node->stats->{$k})) {
        $v = (float)$node->stats->{$k};
        if ($v !== 0.0) return $v;
      }
    }
    // Som tekst "k=v; k2=v2"
    $txt = trim((string)$node->stats);
    if ($txt !== '') {
      foreach ($keys as $k) {
        if (preg_match('/\b'.preg_quote($k,'/').'\s*=\s*([+-]?\d+(?:\.\d+)?)/i', $txt, $m)) {
          $v = (float)$m[1];
          if ($v !== 0.0) return $v;
        }
      }
    }
  }
  return 0.0;
}

/**
 * Indexér XML nodes efter id-attribut
 */
function xml_index_by_id(string $kind): array {
  $path = find_xml_path($kind);
  if (!$path) return [];
  $xml = load_xml_or_null($path);
  if (!$xml) return [];
  // Antag top-level element har children med @id (fx <building id="...">)
  $result = [];
  foreach ($xml->xpath('//*[@id]') ?: [] as $n) {
    $id = (string)$n['id'];
    if ($id !== '') $result[$id] = $n;
  }
  return $result;
}

/**
 * Hjælp: tilføj .l{level}-suffix hvis det ikke allerede er der.
 */
function ensure_level_suffix(string $scopedId, ?int $level): string {
  if ($level === null || $level <= 0) return $scopedId;
  if (preg_match('/\.l\d+$/i', $scopedId)) return $scopedId;
  return $scopedId . '.l' . $level;
}

/**
 * Tjek om tabel findes
 */
function table_exists(PDO $pdo, string $name): bool {
  $st = $pdo->prepare("SHOW TABLES LIKE ?");
  $st->execute([$name]);
  return (bool)$st->fetchColumn();
}

/**
 * Beregn samlet lagerkapacitet for bruger ved at scanne DB-ejede entities
 * og slå kapacitets-stats op i XML:
 *  - keys: storageCapacity, storageSolidCap, storageLiquidCap
 * Dækker: buildings (bld_id, level), addon (add_id, level), research (rsd_id), animals (ani_id eller animal_id)
 */
function compute_total_storage_capacity_from_xml(PDO $pdo, int $userId): array {
  $KEYS = ['storageCapacity','storageSolidCap','storageLiquidCap'];
  $sum = 0.0;
  $break = [
    'buildings' => 0.0,
    'addon'     => 0.0,
    'research'  => 0.0,
    'animals'   => 0.0,
    'resources' => 0.0, // i tilfælde af ressourcer giver kapacitet
  ];

  // Indexér XML
  $bldIdx = xml_index_by_id('buildings');
  $addIdx = xml_index_by_id('addon');
  $rsdIdx = xml_index_by_id('research');
  $aniIdx = xml_index_by_id('animals');
  $resIdx = xml_index_by_id('resources');

  // Buildings
  if (table_exists($pdo, 'buildings') && !empty($bldIdx)) {
    $st = $pdo->prepare("SELECT bld_id, level FROM buildings WHERE user_id=?");
    $st->execute([$userId]);
    while ($row = $st->fetch(PDO::FETCH_ASSOC)) {
      $id  = (string)($row['bld_id'] ?? '');
      $lvl = isset($row['level']) ? (int)$row['level'] : null;
      if ($id === '') continue;
      $sid = ensure_level_suffix($id, $lvl);
      if (isset($bldIdx[$sid])) {
        $v = xml_stat_value_from_node($bldIdx[$sid], $KEYS);
        if ($v !== 0.0) { $sum += $v; $break['buildings'] += $v; }
      } elseif (isset($bldIdx[$id])) {
        $v = xml_stat_value_from_node($bldIdx[$id], $KEYS);
        if ($v !== 0.0) { $sum += $v; $break['buildings'] += $v; }
      }
    }
  }

  // Addons
  if (table_exists($pdo, 'addon') && !empty($addIdx)) {
    $st = $pdo->prepare("SELECT add_id, level FROM addon WHERE user_id=?");
    $st->execute([$userId]);
    while ($row = $st->fetch(PDO::FETCH_ASSOC)) {
      $id  = (string)($row['add_id'] ?? '');
      $lvl = isset($row['level']) ? (int)$row['level'] : null;
      if ($id === '') continue;
      $sid = ensure_level_suffix($id, $lvl);
      if (isset($addIdx[$sid])) {
        $v = xml_stat_value_from_node($addIdx[$sid], $KEYS);
        if ($v !== 0.0) { $sum += $v; $break['addon'] += $v; }
      } elseif (isset($addIdx[$id])) {
        $v = xml_stat_value_from_node($addIdx[$id], $KEYS);
        if ($v !== 0.0) { $sum += $v; $break['addon'] += $v; }
      }
    }
  }

  // Research
  if (table_exists($pdo, 'research') && !empty($rsdIdx)) {
    $st = $pdo->prepare("SELECT rsd_id FROM research WHERE user_id=?");
    $st->execute([$userId]);
    while ($row = $st->fetch(PDO::FETCH_ASSOC)) {
      $id = (string)($row['rsd_id'] ?? '');
      if ($id === '') continue;
      if (isset($rsdIdx[$id])) {
        $v = xml_stat_value_from_node($rsdIdx[$id], $KEYS);
        if ($v !== 0.0) { $sum += $v; $break['research'] += $v; }
      }
    }
  }

  // Animals
  if (table_exists($pdo, 'animals') && !empty($aniIdx)) {
    // Forsøg kolonnenavn 'ani_id' først, ellers 'animal_id'
    $col = null;
    $cols = $pdo->query("SHOW COLUMNS FROM animals")->fetchAll(PDO::FETCH_COLUMN, 0) ?: [];
    if (in_array('ani_id', $cols, true)) $col = 'ani_id';
    elseif (in_array('animal_id', $cols, true)) $col = 'animal_id';
    if ($col) {
      $st = $pdo->prepare("SELECT {$col} AS ani_id, quantity FROM animals WHERE user_id=?");
      $st->execute([$userId]);
      while ($row = $st->fetch(PDO::FETCH_ASSOC)) {
        $id  = (string)($row['ani_id'] ?? '');
        $qty = (float)($row['quantity'] ?? 0);
        if ($id === '' || $qty <= 0) continue;
        if (isset($aniIdx[$id])) {
          $v = xml_stat_value_from_node($aniIdx[$id], $KEYS);
          if ($v !== 0.0) { $sum += ($v * $qty); $break['animals'] += ($v * $qty); }
        }
      }
    }
  }

  // Kapacitetsbidrag fra ressourcer (hvis fx en res giver storage)
  if (!empty($resIdx)) {
    $st = $pdo->prepare("SELECT res_id, SUM(amount) AS amount FROM inventory WHERE user_id = ? GROUP BY res_id");
    $st->execute([$userId]);
    while ($row = $st->fetch(PDO::FETCH_ASSOC)) {
      $rid = (string)($row['res_id'] ?? '');
      $amt = (float)($row['amount'] ?? 0);
      if ($rid === '' || $amt <= 0) continue;
      if (isset($resIdx[$rid])) {
        $v = xml_stat_value_from_node($resIdx[$rid], $KEYS);
        if ($v !== 0.0) { $sum += ($v * $amt); $break['resources'] += ($v * $amt); }
      }
    }
  }

  return ['total'=>$sum, 'breakdown'=>$break, 'source'=>'xml_scan'];
}

/**
 * Brugte plads: sum(inventory.amount × unitSpace fra resources.xml)
 */
function compute_used_space_from_inventory_xml(PDO $pdo, int $userId): array {
  $st = $pdo->prepare("SELECT res_id, SUM(amount) AS amount FROM inventory WHERE user_id = ? GROUP BY res_id");
  $st->execute([$userId]);
  $sum = 0.0; $items = [];
  while ($row = $st->fetch(PDO::FETCH_ASSOC)) {
    $rid = (string)($row['res_id'] ?? '');
    $amt = (float)($row['amount'] ?? 0);
    if ($rid === '' || $amt <= 0) continue;
    $u = xml_read_unit_space($rid);
    $u = ($u !== null) ? (float)$u : 1.0; // defensivt fallback
    $space = $amt * $u;
    $sum += $space;
    $items[] = ['res_id'=>$rid, 'amount'=>$amt, 'unit_space'=>$u, 'space'=>$space];
  }
  return ['used'=>$sum, 'items'=>$items, 'source'=>'xml_scan'];
}

try {
  $pdo = db();
  $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

  $userId = $_SESSION['uid'] ?? null;
  if (!$userId) { http_response_code(401); echo json_encode(['ok'=>false,'error'=>['message'=>'Not logged in']], JSON_UNESCAPED_UNICODE); exit; }

  $id = (int)($_POST['id'] ?? ($_GET['id'] ?? 0));
  if ($id <= 0) { http_response_code(400); echo json_encode(['ok'=>false,'error'=>['message'=>'Invalid id']], JSON_UNESCAPED_UNICODE); exit; }

  $pdo->beginTransaction();

  // Lås opslag
  $st = $pdo->prepare("SELECT * FROM marketplace WHERE id = ? FOR UPDATE");
  $st->execute([$id]);
  $m = $st->fetch(PDO::FETCH_ASSOC);
  if (!$m) { $pdo->rollBack(); http_response_code(404); echo json_encode(['ok'=>false,'error'=>['message'=>'Listing not found']], JSON_UNESCAPED_UNICODE); exit; }
  if ((int)$m['user_id'] !== (int)$userId) { $pdo->rollBack(); http_response_code(403); echo json_encode(['ok'=>false,'error'=>['message'=>'Not owner']], JSON_UNESCAPED_UNICODE); exit; }
  if ((string)$m['status'] !== 'forsale') { $pdo->rollBack(); http_response_code(400); echo json_encode(['ok'=>false,'error'=>['message'=>'Not cancellable']], JSON_UNESCAPED_UNICODE); exit; }

  $resId  = (string)$m['res_id'];
  $amount = (float)$m['amount'];

  // 10% straf (valgfrit)
  $returnAmount = $amount;
  $penalty = 0.0;
  if (CANCEL_PENALTY_PCT > 0.0) {
    $penalty = $amount * CANCEL_PENALTY_PCT;
    $returnAmount = max(0.0, $amount - $penalty);
  }

  // Slå unitSpace op for netop denne ressource
  $unitSpace = xml_read_unit_space($resId);
  $unitSpace = ($unitSpace !== null) ? (float)$unitSpace : 1.0;
  $needSpace = $returnAmount * $unitSpace;

  // Beregn brugt plads og total kapacitet uden summary
  $usedInfo = compute_used_space_from_inventory_xml($pdo, (int)$userId);
  $usedSpace = (float)$usedInfo['used'];

  $capInfo = compute_total_storage_capacity_from_xml($pdo, (int)$userId);
  $totalCap = (float)$capInfo['total'];

  $available = max(0.0, $totalCap - $usedSpace);

  if ($needSpace > $available + 1e-9) {
    // Ikke plads til alle returnerede varer – afvis
    $pdo->rollBack();
    http_response_code(400);
    echo json_encode(['ok'=>false,'error'=>[
      'message'=>'Ikke nok lagerplads til at annullere. Fjern/forbrug noget først.',
      'details'=>[
        'res_id'=>$resId,
        'return_amount'=>$returnAmount,
        'unit_space'=>$unitSpace,
        'need_space'=>$needSpace,
        'available_space'=>$available,
        'total_capacity'=>$totalCap,
        'used_space'=>$usedSpace,
        'unit_space_source'=>'xml',
        'capacity_source'=>$capInfo['source'] ?? 'xml_scan',
        'capacity_breakdown'=>$capInfo['breakdown'] ?? null,
      ],
    ]], JSON_UNESCAPED_UNICODE);
    exit;
  }

  // Tilbagefør ressource til inventory (upsert)
  $upd = $pdo->prepare("UPDATE inventory SET amount = amount + ? WHERE user_id = ? AND res_id = ?");
  $upd->execute([$returnAmount, $userId, $resId]);
  if ($upd->rowCount() === 0) {
    $ins = $pdo->prepare("INSERT INTO inventory (user_id, res_id, amount) VALUES (?, ?, ?)");
    $ins->execute([$userId, $resId, $returnAmount]);
  }

  // Markér opslag som annulleret
  $pdo->prepare("UPDATE marketplace SET status='canceled', canceled_at=NOW() WHERE id = ?")->execute([$id]);

  $pdo->commit();

  echo json_encode(['ok'=>true,'data'=>[
    'id'=>$id,
    'res_id'=>$resId,
    'listed_amount'=>$amount,
    'returned_amount'=>$returnAmount,
    'penalty_applied'=>(CANCEL_PENALTY_PCT > 0.0),
    'penalty_amount'=>$penalty,
    'unit_space'=>$unitSpace,
  ]], JSON_UNESCAPED_UNICODE);
  exit;

} catch (Throwable $e) {
  if (isset($pdo) && $pdo instanceof PDO && $pdo->inTransaction()) $pdo->rollBack();
  http_response_code(500);
  echo json_encode(['ok'=>false,'error'=>['message'=>$e->getMessage(),'file'=>$e->getFile(),'line'=>$e->getLine()]], JSON_UNESCAPED_UNICODE);
  exit;
}