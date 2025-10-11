<?php
declare(strict_types=1);

// Fælles helper‑funktioner — defensive så de ikke overskriver.
if (!function_exists('jout')) {
  function jout($ok, $payload) {
    echo json_encode($ok ? ['ok' => true, 'data' => $payload] : ['ok' => false, 'error' => $payload], JSON_UNESCAPED_UNICODE);
    exit;
  }
}
if (!function_exists('jerr')) {
  function jerr(string $msg, int $http = 400) {
    http_response_code($http);
    jout(false, ['message' => $msg]);
  }
}
if (!function_exists('jerr200')) {
  function jerr200(string $msg, array $extra = []) {
    $payload = array_merge(['message' => $msg], $extra);
    jout(false, $payload);
  }
}
if (!function_exists('tableExists')) {
  function tableExists(PDO $pdo, string $name): bool {
    $st = $pdo->prepare("SHOW TABLES LIKE ?");
    $st->execute([$name]);
    return (bool)$st->fetchColumn();
  }
}
if (!function_exists('ensureMarketplaceTable')) {
  function ensureMarketplaceTable(PDO $pdo): void {
    $sql = "CREATE TABLE IF NOT EXISTS `marketplace` (
      `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
      `user_id` BIGINT NOT NULL,
      `res_id` VARCHAR(64) NOT NULL,
      `amount` DECIMAL(20,3) NOT NULL,
      `price` DECIMAL(20,3) NOT NULL,
      `status` ENUM('forsale','sold','canceled') NOT NULL DEFAULT 'forsale',
      `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      `sold_at` DATETIME NULL,
      `canceled_at` DATETIME NULL,
      INDEX (`user_id`),
      INDEX (`res_id`),
      INDEX (`status`),
      INDEX (`created_at`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;";
    $pdo->exec($sql);
  }
}