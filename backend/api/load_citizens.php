<?php
function loadCitizens() {
    $citizens = [];
    $xml = simplexml_load_file(__DIR__ . '/citizens.xml'); // Sikker sti relativt til filen
    foreach ($xml->citizen as $citizen) {
        $citizens[] = [
            'id' => (string)$citizen->id,
            'name' => (string)$citizen->name,
        ];
    }
    return $citizens;
}

$defs['citizens'] = loadCitizens();
?>