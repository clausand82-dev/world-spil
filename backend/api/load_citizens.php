<?php
declare(strict_types=1);

function loadCitizens(string $xmlPath, bool $includeEmptyFields = true, $emptyValue = 0): array
{
    if (!is_file($xmlPath)) {
        throw new RuntimeException("citizens.xml not found at: {$xmlPath}");
    }

    libxml_use_internal_errors(true);
    $xml = simplexml_load_file($xmlPath);
    if ($xml === false) {
        $errs = array_map(fn($e) => trim($e->message ?? 'XML error'), libxml_get_errors());
        libxml_clear_errors();
        throw new RuntimeException("Failed parsing XML: " . implode("; ", $errs));
    }

    if ($xml->getName() !== 'citizensData') {
        // valgfrit: throw hvis du vil håndhæve root
        // throw new RuntimeException("Unexpected root: " . $xml->getName());
    }

    $result = [];
    foreach ($xml->citizens as $citizen) {
        $id = (string)($citizen['id'] ?? '');
        if ($id === '') continue;

        $data = [];
        foreach ($citizen->children() as $child) {
            $key = $child->getName();
            $raw = trim((string)$child);

            if ($raw === '') {
                if ($includeEmptyFields) $data[$key] = $emptyValue; // fx 0 eller null
                continue;
            }
            $data[$key] = is_numeric($raw) ? (float)$raw : $raw;
        }
        $result[$id] = $data;
    }

    return $result;
}