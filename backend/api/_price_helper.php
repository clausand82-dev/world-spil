<?php
declare(strict_types=1);
/**
 * Simple price engine + update helper.
 * - getEffectivePrice(PDO, resId, opts)
 * - updatePriceAfterSale(PDO, resId, soldAmount, $force=false)
 *
 * Behaviour:
 * - getEffectivePrice returns price using resource_prices row if present,
 *   otherwise fallback to default base.
 * - updatePriceAfterSale increments demand by soldAmount and recomputes
 *   last_price only if upgraded_at older than 1 hour (or $force).
 */

if (!function_exists('clamp')) {
  function clamp(float $v, float $min, float $max): float {
    return ($v < $min) ? $min : (($v > $max) ? $max : $v);
  }
}

if (!function_exists('getEffectivePrice')) {
  function getEffectivePrice(PDO $pdo, string $resId, array $opts = []): float {
    $st = $pdo->prepare("SELECT base_price, demand, supply, multiplier, last_price, updated_at FROM resource_prices WHERE res_id = ?");
    $st->execute([$resId]);
    $row = $st->fetch(PDO::FETCH_ASSOC);

    // Defaults
    $base = isset($opts['default_base']) ? (float)$opts['default_base'] : 1.0;
    $d = 1.0;
    $s = 1.0;
    $m = 1.0;

    if ($row) {
      $base = (float)$row['base_price'];
      $d = max(0.0, (float)$row['demand']);
      $s = max(0.0, (float)$row['supply']);
      $m = (float)$row['multiplier'];
    }

    $sensitivity = isset($opts['sensitivity']) ? (float)$opts['sensitivity'] : 0.25;
    // simple bounded factor based on demand vs supply
    $den = max(1e-6, $d + $s);
    $imbalance = ($d - $s) / $den; // in (-1,1)
    // map imbalance to factor with sensitivity, keep factor bounded
    $factor = 1.0 + ($sensitivity * $imbalance);
    $factor = clamp($factor, 0.5, 2.0);

    $price = $base * $m * $factor;

    // Optional volatility (small random jitter if requested)
    $volatility = isset($opts['volatility']) ? (float)$opts['volatility'] : 0.0;
    if ($volatility > 0.0) {
      $rand = (mt_rand() / mt_getrandmax()) * 2 - 1; // -1..1
      $price *= (1.0 + $rand * $volatility);
    }

    $price = max(0.000001, round($price, 6));
    return $price;
  }
}

if (!function_exists('updatePriceAfterSale')) {
  function updatePriceAfterSale(PDO $pdo, string $resId, float $soldAmount, bool $force = false): void {
    // Ensure row exists
    $ins = $pdo->prepare("INSERT INTO resource_prices (res_id, base_price, demand, supply, multiplier, last_price, updated_at)
      VALUES (?, 1.0, 0, 1.0, 1.0, NULL, NULL)
      ON DUPLICATE KEY UPDATE res_id = VALUES(res_id)");
    $ins->execute([$resId]);

    // Increment demand by soldAmount (keeps stats)
    $upd = $pdo->prepare("UPDATE resource_prices SET demand = demand + ? WHERE res_id = ?");
    $upd->execute([(float)$soldAmount, $resId]);

    // Check last update time
    $st = $pdo->prepare("SELECT updated_at FROM resource_prices WHERE res_id = ?");
    $st->execute([$resId]);
    $row = $st->fetch(PDO::FETCH_ASSOC);
    $lastUpdated = $row && $row['updated_at'] ? strtotime($row['updated_at']) : 0;
    $now = time();

    // Only recompute last_price at most once per hour, unless $force
    $oneHour = 3600;
    if ($force || ($now - $lastUpdated) >= $oneHour) {
      // Recompute using current demand/supply/multiplier
      $price = getEffectivePrice($pdo, $resId, ['sensitivity' => 0.25, 'volatility' => 0.0]);
      $upd2 = $pdo->prepare("UPDATE resource_prices SET last_price = ?, updated_at = NOW() WHERE res_id = ?");
      $upd2->execute([$price, $resId]);
    }
  }
}