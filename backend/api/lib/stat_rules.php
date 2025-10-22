<?php
declare(strict_types=1);

/**
 * Loader for stat rules: parse defs/stat_rules.xml into a PHP array.
 * Place this file as backend/api/lib/stat_rules.php
 * Usage: $rules = stat_rules_config();
 * 
 * 
 * BRUGES TIL AT FÅ STATS TIL AT PÅVIRKE RES VIA BUFF - ER ET FORSØG SÅ DROPPES DET KAN DENNE FIL SLETTES
 */

function stat_rules_config(): array {
  $pathCandidates = [
    __DIR__ . '/../../data/defs/stat_rules.xml',   // backend/data/defs/...
    __DIR__ . '/../../data/xml/stat_rules.xml',    // backend/data/xml/...
    __DIR__ . '/../../data/stat_rules.xml',        // backend/data/...
    __DIR__ . '/../../../data/defs/stat_rules.xml' // hvis strukturen er anderledes
  ];

  $path = null;
  foreach ($pathCandidates as $p) {
    if (file_exists($p)) { $path = $p; break; }
  }
  if (!$path) return [];

  $xml = @simplexml_load_file($path);
  if (!$xml) return [];

  $out = [];
  foreach ($xml->rule as $r) {
    $id = (string)($r['id'] ?? '');
    if ($id === '') continue;
    $enabled = ((string)($r['enabled'] ?? 'true')) !== 'false';
    $expr = trim((string)($r->expr ?? ''));
    $stage = intval((string)($r->stage ?? 1));
    $scope = (string)($r->scope ?? 'player');
    $refresh = (string)($r->refreshPolicy ?? 'refresh');

    $buff = null;
    if (isset($r->buff)) {
      $b = $r->buff;
      $buff = [];
      $buff['kind'] = (string)($b->kind ?? '');
      $buff['mode'] = (string)($b->mode ?? '');
      $buff['op'] = (string)($b->op ?? '');
      $buff['amount'] = isset($b->amount) ? floatval((string)$b->amount) : null;
      $buff['scopeTarget'] = (string)($b->scopeTarget ?? '');
      // map xml nodes into fields that buffs.php expects:
      // - applies_to (ctx) => use appliesTo if present
      $buff['applies_to'] = (string)($b->appliesTo ?? '');
      $buff['actions'] = (string)($b->actions ?? '');
      $buff['source'] = (string)($b->source ?? ("stat.$id"));
    }

    $effect = null;
    if (isset($r->effect)) {
      $effect = [
        'type' => (string)($r->effect->type ?? ''),
        'multiplier' => isset($r->effect->multiplier) ? floatval((string)$r->effect->multiplier) : null,
        'source' => (string)($r->effect->source ?? ("stat.$id")),
      ];
    }

    $out[$id] = [
      'id' => $id,
      'enabled' => $enabled,
      'expr' => $expr,
      'stage' => $stage,
      'scope' => $scope,
      'refreshPolicy' => $refresh,
      'buff' => $buff,
      'effect' => $effect,
      'ui' => [
        'message' => (string)($r->ui->message ?? ''),
      ],
    ];
  }
  return $out;
}