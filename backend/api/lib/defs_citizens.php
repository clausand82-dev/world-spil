<?php
require_once __DIR__ . '/../load_citizens.php';

function build_defs(): array {
    $defs = [];
    $defs['citizens'] = loadCitizens(__DIR__ . '/../../data/xml/citizens.xml', true, 0);
    return $defs;
}