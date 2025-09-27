<?php
declare(strict_types=1);

/**
 * Generiske helpers til kapaciteter (fra bld/addon/rsd.stats.*) og vægtede forbrug (fra defs.citizens.*).
 * - Scope-stripper: bld.tent.l1 -> tent.l1 (defs.bld bruger uden scope)
 * - Level-håndtering: hvis id mangler .lN og level er kendt, prøv base+.lN
 * - Stats-parser: understøtter både stats som array og som rå "k=v" streng med ; eller , som separator
 * - Adult/Crime MODEL A (adults uden crime, crime separat)
 */

function cu_strip_scope(string $id): string {
  return preg_replace('/^(bld|add|rsd|ani|res)\./', '', $id) ?? $id;
}
function cu_has_level_suffix(string $id): bool {
  return (bool)preg_match('/\.l\d+$/', $id);
}
function cu_with_level_suffix(string $baseId, int $level): string {
  return ($level > 0) ? "{$baseId}.l{$level}" : $baseId;
}

/** Læs stats-værdi fra defs-node (array eller string). */
function cu_stat_from_defs_node($node, array $keys): float {
  if (!is_array($node) && !is_object($node)) return 0.0;

  if (is_array($node)) {
    $stats = $node['stats'] ?? null;
    if (is_array($stats)) {
      foreach ($keys as $k) {
        if (array_key_exists($k, $stats)) return (float)$stats[$k];
      }
    }
    $s = is_string($stats) ? $stats : null;
  } else {
    $s = isset($node->stats) ? (string)$node->stats : null;
  }

  if ($s) {
    $pairs = preg_split('/[;,]\s*/', $s);
    foreach ($pairs as $p) {
      foreach ($keys as $k) {
        if (preg_match('/^\s*'.preg_quote($k,'/').'\s*=\s*([+-]?\d+(?:\.\d+)?)\s*$/i', $p, $m)) {
          return (float)$m[1];
        }
      }
    }
  }
  return 0.0;
}

/** Slå en stats-kapacitet op i en defs-gren (fx $defs['bld']). */
function cu_stat_from_defs(array $defsBranch, string $scopedId, ?int $level, array $keys): float {
  $id = cu_strip_scope($scopedId);

  if (isset($defsBranch[$id])) {
    $v = cu_stat_from_defs_node($defsBranch[$id], $keys);
    if ($v !== 0.0) return $v;
  }
  if (!cu_has_level_suffix($id) && $level !== null && $level > 0) {
    $alt = cu_with_level_suffix($id, $level);
    if (isset($defsBranch[$alt])) {
      $v = cu_stat_from_defs_node($defsBranch[$alt], $keys);
      if ($v !== 0.0) return $v;
    }
  }
  return 0.0;
}

/** Summer kapacitet over en instans-tabel (buildings/addon). */
function cu_sum_capacity_from_table(PDO $pdo, int $userId, array $defsBranch, string $table, string $idCol, string $lvlCol, array $keys): float {
  $st = $pdo->prepare("SELECT {$idCol} AS id, {$lvlCol} AS lvl FROM {$table} WHERE user_id=?");
  $st->execute([$userId]);
  $sum = 0.0;
  while ($row = $st->fetch(PDO::FETCH_ASSOC)) {
    $sum += cu_stat_from_defs($defsBranch, (string)$row['id'], (int)$row['lvl'], $keys);
  }
  return $sum;
}

/** Summer kapacitet over completed research. */
function cu_sum_capacity_from_research(PDO $pdo, int $userId, array $defsRsd, array $keys): float {
  $st = $pdo->prepare("SELECT research_id FROM user_research WHERE user_id=? AND completed=1");
  $st->execute([$userId]);
  $sum = 0.0;
  while ($row = $st->fetch(PDO::FETCH_ASSOC)) {
    $rid = (string)$row['research_id'];
    if (isset($defsRsd[$rid])) {
      $sum += cu_stat_from_defs_node($defsRsd[$rid], $keys);
    } else {
      $rid2 = cu_strip_scope($rid);
      if (isset($defsRsd[$rid2])) $sum += cu_stat_from_defs_node($defsRsd[$rid2], $keys);
    }
  }
  return $sum;
}

/** DB-utility: tjek tabel. */
function cu_table_exists(PDO $pdo, string $name): bool {
  $db = (string)$pdo->query('SELECT DATABASE()')->fetchColumn();
  $st = $pdo->prepare('SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA=? AND TABLE_NAME=?');
  $st->execute([$db, $name]);
  return (bool)$st->fetchColumn();
}

/** Citizens-række (sikre defaults 0). */
function cu_fetch_citizens_row(PDO $pdo, int $userId): array {
  $st = $pdo->prepare('SELECT * FROM citizens WHERE user_id=? LIMIT 1');
  $st->execute([$userId]);
  $row = $st->fetch(PDO::FETCH_ASSOC) ?: [];
  $keys = [
    'baby','kidsStreet','kidsStudent','youngStudent','youngWorker','old',
    'adultsPolice','adultsFire','adultsHealth','adultsSoldier','adultsGovernment','adultsPolitician','adultsUnemployed','adultsWorker','adultsHomeless',
    'crimePolice','crimeFire','crimeHealth','crimeSoldier','crimeGovernment','crimePolitician','crimeUnemployed','crimeWorker','crimeHomeless',
  ];
  $out = [];
  foreach ($keys as $k) $out[$k] = (int)($row[$k] ?? 0);
  return $out;
}

function cu_cit_val(array $row, string $key): int {
  return (int)($row[$key] ?? 0);
}

/** Læs citizens use*-værdi med alias-understøttelse (fx useCloth => useProductCloth). */
function cu_cit_use(array $defsCit, string $group, string $useField, array $aliases = []): float {
  $node = $defsCit[$group] ?? null;
  if (!is_array($node)) return 0.0;

  // direkte
  if (array_key_exists($useField, $node) && $node[$useField] !== '' && $node[$useField] !== null) {
    return (float)$node[$useField];
  }
  // alias
  if (isset($aliases[$useField])) {
    $alt = $aliases[$useField];
    if (array_key_exists($alt, $node) && $node[$alt] !== '' && $node[$alt] !== null) {
      return (float)$node[$alt];
    }
  }
  return 0.0;
}

/**
 * Vægtet forbrug pr. makrogruppe for et citizens-felt $useField (MODEL A for adults/crime).
 * Return: ['total'=>float, 'breakdown'=>['baby'=>..,'kids'=>..,'young'=>..,'adults'=>..,'old'=>..,'crime'=>..], 'details'=>[...] ]
 */
function cu_usage_breakdown(array $citRow, array $defsCit, string $useField, array $useAliases = []): array {
  $kidsKeys  = ['kidsStreet','kidsStudent'];
  $youngKeys = ['youngStudent','youngWorker'];
  $adultPairs = [
    ['adultsPolice','crimePolice'],
    ['adultsFire','crimeFire'],
    ['adultsHealth','crimeHealth'],
    ['adultsSoldier','crimeSoldier'],
    ['adultsGovernment','crimeGovernment'],
    ['adultsPolitician','crimePolitician'],
    ['adultsUnemployed','crimeUnemployed'],
    ['adultsWorker','crimeWorker'],
    ['adultsHomeless','crimeHomeless'],
  ];

  $sumBaby = cu_cit_val($citRow, 'baby') * cu_cit_use($defsCit, 'baby', $useField, $useAliases);

  $sumKids = 0.0;
  foreach ($kidsKeys as $g) $sumKids += cu_cit_val($citRow, $g) * cu_cit_use($defsCit, $g, $useField, $useAliases);

  $sumYoung = 0.0;
  foreach ($youngKeys as $g) $sumYoung += cu_cit_val($citRow, $g) * cu_cit_use($defsCit, $g, $useField, $useAliases);

  $sumOld = cu_cit_val($citRow, 'old') * cu_cit_use($defsCit, 'old', $useField, $useAliases);

  $sumAdults = 0.0;
  $sumCrime  = 0.0;
  $details = [];

  foreach ($adultPairs as [$aKey, $cKey]) {
    $aCnt = cu_cit_val($citRow, $aKey);
    $cCnt = cu_cit_val($citRow, $cKey);
    $onlyAdults = max(0, $aCnt - $cCnt);

    $aUse = cu_cit_use($defsCit, $aKey, $useField, $useAliases);
    $cUse = cu_cit_use($defsCit, $cKey,  $useField, $useAliases);

    $aUsed = $onlyAdults * $aUse;
    $cUsed = $cCnt       * $cUse;

    $sumAdults += $aUsed;
    $sumCrime  += $cUsed;

    $details[$aKey] = ['count'=>$onlyAdults,'use'=>$aUse,'used'=>$aUsed];
    $details[$cKey] = ['count'=>$cCnt,'use'=>$cUse,'used'=>$cUsed];
  }

  $total = $sumBaby + $sumKids + $sumYoung + $sumAdults + $sumOld + $sumCrime;

  return [
    'total' => $total,
    'breakdown' => [
      'baby'   => $sumBaby,
      'kids'   => $sumKids,
      'young'  => $sumYoung,
      'adults' => $sumAdults,
      'old'    => $sumOld,
      'crime'  => $sumCrime,
    ],
    'details' => $details,
  ];
}

/** Forsøg at skaffe defs['citizens']; fallback: parse XML direkte hvis ikke tilgængelig. */
function cu_load_defs_citizens(array $defs): array {
  if (isset($defs['citizens']) && is_array($defs['citizens'])) return $defs['citizens'];
  $xmlPath = __DIR__ . '/../../data/xml/citizens.xml';
  if (!is_file($xmlPath)) return [];
  $xml = @simplexml_load_file($xmlPath);
  if (!$xml) return [];
  $res = [];
  foreach ($xml->citizens as $node) {
    $id = (string)($node['id'] ?? '');
    if ($id === '') continue;
    $data = [];
    foreach ($node->children() as $child) {
      $k = $child->getName();
      $v = trim((string)$child);
      if ($v === '') continue;
      $data[$k] = is_numeric($v) ? (float)$v : $v;
    }
    $res[$id] = $data;
  }
  return $res;
}

/**
 * Rå person-antal pr. makrogruppe baseret på citizens-rækken (MODEL A for adults/crime).
 * - macro['adults'] = lovlydige voksne = sum(adultsX - crimeX)
 * - macro['crime']  = sum(crimeX)
 * - macro['adultsTotal'] = sum(adultsX) (kun hvis du vil vise total voksne inkl. crime i andre visninger)
 */
function cu_group_counts(array $citRow): array {
  $kidsKeys  = ['kidsStreet','kidsStudent'];
  $youngKeys = ['youngStudent','youngWorker'];
  $adultPairs = [
    ['adultsPolice','crimePolice'],
    ['adultsFire','crimeFire'],
    ['adultsHealth','crimeHealth'],
    ['adultsSoldier','crimeSoldier'],
    ['adultsGovernment','crimeGovernment'],
    ['adultsPolitician','crimePolitician'],
    ['adultsUnemployed','crimeUnemployed'],
    ['adultsWorker','crimeWorker'],
    ['adultsHomeless','crimeHomeless'],
  ];

  $baby  = (int)($citRow['baby'] ?? 0);
  $kids  = array_sum(array_map(fn($k)=> (int)($citRow[$k] ?? 0), $kidsKeys));
  $young = array_sum(array_map(fn($k)=> (int)($citRow[$k] ?? 0), $youngKeys));
  $old   = (int)($citRow['old'] ?? 0);

  $adultsOnly = 0;
  $adultsTotal = 0;
  $crime = 0;
  foreach ($adultPairs as [$aKey, $cKey]) {
    $a = (int)($citRow[$aKey] ?? 0);
    $c = (int)($citRow[$cKey] ?? 0);
    $adultsOnly  += max(0, $a - $c);
    $adultsTotal += $a;
    $crime       += $c;
  }

  return [
    'macro' => [
      'baby'        => $baby,
      'kids'        => $kids,
      'young'       => $young,
      'adults'      => $adultsOnly,   // lovlydige (MODEL A)
      'adultsTotal' => $adultsTotal,  // voksne inkl. crime
      'old'         => $old,
      'crime'       => $crime,
    ],
    // fine-grained uden crime (til lang liste)
    'fine' => [
      'baby' => $baby,
      'kidsStreet'    => (int)($citRow['kidsStreet'] ?? 0),
      'kidsStudent'   => (int)($citRow['kidsStudent'] ?? 0),
      'youngStudent'  => (int)($citRow['youngStudent'] ?? 0),
      'youngWorker'   => (int)($citRow['youngWorker'] ?? 0),
      'adultsPolice'      => max(0, (int)($citRow['adultsPolice'] ?? 0) - (int)($citRow['crimePolice'] ?? 0)),
      'adultsFire'        => max(0, (int)($citRow['adultsFire'] ?? 0) - (int)($citRow['crimeFire'] ?? 0)),
      'adultsHealth'      => max(0, (int)($citRow['adultsHealth'] ?? 0) - (int)($citRow['crimeHealth'] ?? 0)),
      'adultsSoldier'     => max(0, (int)($citRow['adultsSoldier'] ?? 0) - (int)($citRow['crimeSoldier'] ?? 0)),
      'adultsGovernment'  => max(0, (int)($citRow['adultsGovernment'] ?? 0) - (int)($citRow['crimeGovernment'] ?? 0)),
      'adultsPolitician'  => max(0, (int)($citRow['adultsPolitician'] ?? 0) - (int)($citRow['crimePolitician'] ?? 0)),
      'adultsUnemployed'  => max(0, (int)($citRow['adultsUnemployed'] ?? 0) - (int)($citRow['crimeUnemployed'] ?? 0)),
      'adultsWorker'      => max(0, (int)($citRow['adultsWorker'] ?? 0) - (int)($citRow['crimeWorker'] ?? 0)),
      'adultsHomeless'    => max(0, (int)($citRow['adultsHomeless'] ?? 0) - (int)($citRow['crimeHomeless'] ?? 0)),
      'old' => $old,
    ],
  ];
}

/** Lav per-item liste for en instans-tabel (buildings/addon) for en given stats-nøgle-liste. */
function cu_list_capacity_from_table(PDO $pdo, int $userId, array $defsBranch, string $table, string $idCol, string $lvlCol, array $keys, callable $nameResolver): array {
  $st = $pdo->prepare("SELECT {$idCol} AS id, {$lvlCol} AS lvl FROM {$table} WHERE user_id=?");
  $st->execute([$userId]);
  $items = [];
  while ($row = $st->fetch(PDO::FETCH_ASSOC)) {
    $scopedId = (string)$row['id'];
    $lvl      = (int)$row['lvl'];
    $amount   = cu_stat_from_defs($defsBranch, $scopedId, $lvl, $keys);
    if ($amount == 0.0) continue;
    $idNoScope = cu_strip_scope($scopedId);
    $name      = $nameResolver($defsBranch, $idNoScope, $lvl) ?? $idNoScope;
    $items[] = ['id' => $idNoScope, 'amount' => (float)$amount, 'name' => $name];
  }
  return $items;
}

/** Lav per-item liste for completed research for en given stats-nøgle-liste. */
function cu_list_capacity_from_research(PDO $pdo, int $userId, array $defsRsd, array $keys, callable $nameResolver): array {
  $st = $pdo->prepare("SELECT research_id FROM user_research WHERE user_id=? AND completed=1");
  $st->execute([$userId]);
  $items = [];
  while ($row = $st->fetch(PDO::FETCH_ASSOC)) {
    $rid = cu_strip_scope((string)$row['research_id']);
    if (!isset($defsRsd[$rid])) continue;
    $amount = cu_stat_from_defs_node($defsRsd[$rid], $keys);
    if ($amount == 0.0) continue;
    $name = $nameResolver($defsRsd, $rid, null) ?? $rid;
    $items[] = ['id' => $rid, 'amount' => (float)$amount, 'name' => $name];
  }
  return $items;
}

/** Simpel navneopslag fra defs-node: foretræk 'name', ellers 'desc'. */
function cu_def_name(array $branch, string $id, ?int $level): ?string {
  $try = [$id];
  if ($level !== null && !preg_match('/\.l\d+$/', $id)) {
    $try[] = "{$id}.l{$level}";
  }
  foreach ($try as $key) {
    if (!isset($branch[$key])) continue;
    $node = $branch[$key];
    if (is_array($node)) {
      if (!empty($node['name'])) return (string)$node['name'];
      if (!empty($node['desc'])) return (string)$node['desc'];
    }
  }
  return null;
}