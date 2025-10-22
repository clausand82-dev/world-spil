<?php
declare(strict_types=1);

/**
 * Stateless watcher that evaluates stat rules (from stat_rules_config())
 * and returns an array of buff objects (in the same lightweight shape as defs buffs)
 * that can be merged into collect_active_buffs output (no DB persistence).
 *
 * Place this file as backend/api/lib/stat_watchers.php
 */

if (!function_exists('stat_watcher_compute_buffs')) {
  /**
   * Compute buff objects from rules and current metrics.
   * - $rules: array from stat_rules_config()
   * - $metrics: associative array, expected keys (example): 'happiness','popularity','crimePercent','useFire','fireCapacity','weather'
   * - $userStage: int
   * Returns: array of buff arrays (same shape expected by buffs.php apply_* functions)
   */
  function stat_watcher_compute_buffs(array $rules, array $metrics, int $userStage = 1, ?int $now = null): array {
    if ($now === null) $now = time();
    $out = [];

    foreach ($rules as $rule) {
      if (empty($rule['enabled'])) continue;
      $ruleStage = intval($rule['stage'] ?? 1);
      if ($userStage < $ruleStage) continue;

      $expr = trim((string)($rule['expr'] ?? ''));
      if ($expr === '') continue;

      $match = eval_stat_expression($expr, $metrics);
      if (!$match) continue;

      // If rule has a buff node, create a buff object
      if (!empty($rule['buff']) && is_array($rule['buff'])) {
        $b = $rule['buff'];
        $buffObj = [
          'id' => $rule['id'] ?? ('stat.' . uniqid()),
          'kind' => $b['kind'] ?? 'res',
          'mode' => $b['mode'] ?? 'both',
          'type' => $b['op'] ?? $b['type'] ?? ($b['op'] ?? ''),
          'op' => $b['op'] ?? ($b['type'] ?? 'mult'),
          'amount' => isset($b['amount']) ? floatval($b['amount']) : 0.0,
          // apply scope/target for resource matching: use scopeTarget (csv) or 'all'
          'scope' => $b['scopeTarget'] ?? ($b['scope'] ?? 'all'),
          'applies_to' => $b['applies_to'] ?? ($b['appliesTo'] ?? 'all'),
          'actions' => $b['actions'] ?? null,
          'source' => $b['source'] ?? ('stat.' . ($rule['id'] ?? uniqid())),
          'start_ts' => $now,
          // no end_ts because these stat buffs are live while condition holds
        ];
        $out[] = $buffObj;
      }

      // If rule defines an effect (non-buff), include as effect object for server-side handlers
      if (!empty($rule['effect']) && is_array($rule['effect'])) {
        $effect = $rule['effect'];
        $out[] = [
          'id' => $rule['id'] . '.effect',
          'kind' => 'effect',
          'effect' => $effect,
          'source' => $effect['source'] ?? ('stat.' . ($rule['id'] ?? uniqid())),
          'start_ts' => $now,
        ];
      }
    }

    return $out;
  }
}

/* ---- small, safe expression evaluator ----
   supports patterns like:
     - "happiness <= 0.5"
     - "happiness > 0.8"
     - "popularity < 0.5"
     - "crimePercent > 0.5"
     - "useFire/fireCapacity > 1.0"
     - "weather == 'rain'"
   Note: no eval(), only regex and numeric ops.
*/
if (!function_exists('eval_stat_expression')) {
  function eval_stat_expression(string $expr, array $metrics): bool {
    $expr = trim($expr);
    // handle equality with string values: weather == 'rain'
    if (preg_match("/^([\w.\/]+)\s*(==|!=)\s*'([^']+)'$/", $expr, $m)) {
      $left = $m[1]; $op = $m[2]; $right = $m[3];
      $leftVal = array_key_exists($left, $metrics) ? $metrics[$left] : null;
      if ($op === '==') return (string)$leftVal === $right;
      return (string)$leftVal !== $right;
    }

    // numeric comparisons
    if (!preg_match('/^([\w.\/]+)\s*(>=|<=|==|!=|>|<)\s*([0-9]*\.?[0-9]+)$/', $expr, $m)) {
      return false;
    }
    $leftToken = $m[1]; $op = $m[2]; $right = floatval($m[3]);

    // resolve left token (support ratio a/b)
    $leftVal = NAN;
    if (strpos($leftToken, '/') !== false) {
      [$p1, $p2] = explode('/', $leftToken, 2);
      $v1 = array_key_exists($p1, $metrics) ? $metrics[$p1] : null;
      $v2 = array_key_exists($p2, $metrics) ? $metrics[$p2] : null;
      if (!is_numeric($v1) || !is_numeric($v2) || floatval($v2) == 0.0) return false;
      $leftVal = floatval($v1) / floatval($v2);
    } else {
      if (!array_key_exists($leftToken, $metrics)) return false;
      $v = $metrics[$leftToken];
      if (!is_numeric($v)) return false;
      $leftVal = floatval($v);
    }

    switch ($op) {
      case '>': return $leftVal > $right;
      case '>=': return $leftVal >= $right;
      case '<': return $leftVal < $right;
      case '<=': return $leftVal <= $right;
      case '==': return $leftVal == $right;
      case '!=': return $leftVal != $right;
    }
    return false;
  }
}