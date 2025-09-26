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

  $baby  = cu_cit_val($citRow, 'baby');
  $kids  = 0;
  foreach ($kidsKeys as $k)  $kids  += cu_cit_val($citRow, $k);
  $young = 0;
  foreach ($youngKeys as $k) $young += cu_cit_val($citRow, $k);
  $old   = cu_cit_val($citRow, 'old');

  $adultsOnly = 0;
  $adultsTotal = 0;
  $crime = 0;
  foreach ($adultPairs as [$aKey, $cKey]) {
    $a = cu_cit_val($citRow, $aKey);
    $c = cu_cit_val($citRow, $cKey);
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
      'old'         => $old,
      'crime'       => $crime,
      'adultsTotal' => $adultsTotal,  // valgfri at bruge i andre visninger
    ],
  ];
}