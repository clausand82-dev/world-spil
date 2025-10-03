<?php
// Simple scanner: kræver PHP med simplexml
$xmlDir = realpath(__DIR__ . '/../../data/xml');
$langFile = realpath(__DIR__ . '/../../data/lang/lang.da.xml');
header('Content-Type: text/plain; charset=utf-8');


if (!$xmlDir || !is_dir($xmlDir)) {
    echo "Kunne ikke finde xml dir: $xmlDir" . PHP_EOL;
    exit(1);
}
if (!$langFile || !is_file($langFile)) {
    echo "Kunne ikke finde lang file: $langFile" . PHP_EOL;
    exit(1);
}

$defined = [];   // id => type
$referenced = []; // id => [locations]
$collectId = function($id, $where=null) use (&$referenced) {
    if (!$id) return;
    $parts = array_map('trim', preg_split('/[,;\s]+/', $id));
    foreach ($parts as $p) {
        if ($p === '') continue;
        $referenced[$p][] = $where;
    }
};

// scan xml files
$it = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($xmlDir));
foreach ($it as $f) {
    if (!$f->isFile()) continue;
    if (strtolower($f->getExtension()) !== 'xml') continue;
    $path = $f->getRealPath();
    libxml_use_internal_errors(true);
    $xml = simplexml_load_file($path);
    if (!$xml) {
        echo "Failed to parse $path" . PHP_EOL;
        continue;
    }
    // collect defined ids from common element names
    foreach (['building','research','addon'] as $tag) {
        $nodes = $xml->xpath("//{$tag}[@id]");
        foreach ($nodes as $n) {
            $id = (string)$n['id'];
            $defined[$id] = $tag;
        }
    }
    // collect require / require-like attributes and tags
    // tags: <require>, <upgradesTo>, <upgradesTo><target id="..."/>
    $reqNodes = $xml->xpath("//require");
    foreach ($reqNodes as $r) {
        $text = trim((string)$r);
        if ($text !== '') $collectId($text, $path . ' <require>');
    }
    $upNodes = $xml->xpath("//*[local-name()='upgradesTo']");
    foreach ($upNodes as $u) {
        // either text content or <target id="..."/>
        $txt = trim((string)$u);
        if ($txt !== '') $collectId($txt, $path . ' <upgradesTo>');
        $targs = $u->xpath(".//target[@id]");
        foreach ($targs as $t) {
            $collectId((string)$t['id'], $path . ' <upgradesTo>/<target>');
        }
    }
    // also <require> attributes inside other tags (rare) and <buff applies_to="..."> not considered
    // also check <yield> res ids? not required.
}

// parse lang file
$langXml = simplexml_load_file($langFile);
$langKeys = [];
foreach ($langXml->xpath("//entry[@key]") as $e) {
    $langKeys[(string)$e['key']] = true;
}

// compute missing referenced ids (referenced but not defined)
$missingRefs = [];
foreach ($referenced as $id => $locs) {
    if (!isset($defined[$id])) {
        $missingRefs[$id] = array_unique($locs);
    }
}

// compute missing i18n for defined ids: expect keys id.name and id.desc
$missingI18n = [];
foreach ($defined as $id => $type) {
    $k1 = "{$id}.name";
    $k2 = "{$id}.desc";
    if (!isset($langKeys[$k1]) || !isset($langKeys[$k2])) {
        $missingI18n[$id] = [
            'name' => isset($langKeys[$k1]),
            'desc' => isset($langKeys[$k2]),
        ];
    }
}

// output
echo "Defined ids: " . count($defined) . PHP_EOL;
echo "Referenced ids: " . count($referenced) . PHP_EOL . PHP_EOL;

echo "=== Manglende referenced ids (refereret men ikke defineret) ===" . PHP_EOL;
if (empty($missingRefs)) {
    echo "Ingen manglende referencer fundet." . PHP_EOL;
} else {
    foreach ($missingRefs as $id => $locs) {
        echo "- $id" . PHP_EOL;
        foreach ($locs as $l) echo "    * $l" . PHP_EOL;
    }
}

echo PHP_EOL . "=== Manglende i18n keys (for definerede ids) ===" . PHP_EOL;
if (empty($missingI18n)) {
    echo "Ingen manglende i18n keys fundet." . PHP_EOL;
} else {
    foreach ($missingI18n as $id => $flags) {
        $miss = [];
        if (!$flags['name']) $miss[] = '.name';
        if (!$flags['desc']) $miss[] = '.desc';
        echo "- $id  mangler: " . implode(', ', $miss) . PHP_EOL;
    }
}

exit(0);
?>