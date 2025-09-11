<?php
/**
 * backend/lib/utils.php
 * - Ens JSON-svar (ok/err)
 * - Krav om HTTP-metode
 * - Læs POST JSON-body
 * - Små helpers
 */

declare(strict_types=1);

/** Sæt JSON-header én gang. Kald gerne tidligt i endpoints. */
function json_headers(): void {
    header('Content-Type: application/json; charset=utf-8');
    // (Valgfrit) CORS under udvikling – lås ned i produktion:
    // header('Access-Control-Allow-Origin: http://localhost:1234');
    // header('Access-Control-Allow-Credentials: true');
}

/** Afsend et succes-svar og afslut script. */
function json_ok(array $data = [], int $http = 200): never {
    http_response_code($http);
    json_headers();
    echo json_encode(['ok' => true, 'data' => $data], JSON_UNESCAPED_UNICODE);
    exit;
}

/** Afsend et fejl-svar og afslut script. */
function json_err(string $code, string $msg, int $http = 400): never {
    http_response_code($http);
    json_headers();
    echo json_encode(['ok' => false, 'error' => ['code' => $code, 'message' => $msg]], JSON_UNESCAPED_UNICODE);
    exit;
}

/** Tving at request-metode er POST (ellers 405). */
function require_post(): void {
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
        json_err('E_METHOD', 'Only POST allowed', 405);
    }
}

/** Tving at request-metode er GET (ellers 405). */
function require_get(): void {
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'GET') {
        json_err('E_METHOD', 'Only GET allowed', 405);
    }
}

/** Læs JSON-body for POST. Kaster fejl ved ugyldig/manglende body. */
function read_json_body(): array {
    $raw = file_get_contents('php://input');
    if ($raw === false || $raw === '') json_err('E_BODY', 'Empty JSON body', 400);
    $data = json_decode($raw, true);
    if (!is_array($data)) json_err('E_JSON', 'Invalid JSON', 400);
    return $data;
}

/** Hent felt fra array, ellers fejl. */
function must(array $arr, string $key) {
    if (!array_key_exists($key, $arr)) json_err('E_PARAM', "Missing parameter: {$key}", 400);
    return $arr[$key];
}

/** Simple sanitizer for id-strenge (tillad a-z0-9 .:_-) */
function sanitize_id(string $s): string {
    if (!preg_match('~^[a-z0-9\.\:\-\_]+$~i', $s)) {
        json_err('E_ID', 'Invalid id format', 400);
    }
    return $s;
}
