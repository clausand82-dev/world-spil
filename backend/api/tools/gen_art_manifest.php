<?php
$dir = __DIR__ . '/../../../frontend/public/assets/art';
$out = $dir . '/manifest.json';

$files = [];
$rii = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($dir));

foreach ($rii as $file) {
    if ($file->isDir()) continue;
    $ext = strtolower(pathinfo($file->getFilename(), PATHINFO_EXTENSION));
    if (in_array($ext, ['png','jpg','jpeg','webp'])) {
        $rel = str_replace($dir . DIRECTORY_SEPARATOR, '', $file->getPathname());
        $rel = str_replace('\\','/',$rel); // Windows fix
        $files[] = $rel;
    }
}

sort($files);
file_put_contents($out, json_encode($files, JSON_PRETTY_PRINT));

echo "Manifest generated with ".count($files)." entries\n";
