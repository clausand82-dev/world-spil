<?php
declare(strict_types=1);

require_once __DIR__ . '/citizens.php';

/** Læs nuværende stage (default 1, hvis null) */
function get_current_stage(PDO $pdo, int $userId): int {
    $st = $pdo->prepare('SELECT COALESCE(currentstage, 1) AS s FROM users WHERE user_id = ?');
    $st->execute([$userId]);
    $s = $st->fetchColumn();
    return $s ? (int)$s : 1;
}

/** Sæt nuværende stage */
function set_current_stage(PDO $pdo, int $userId, int $stage): void {
    $st = $pdo->prepare('UPDATE users SET currentstage = ? WHERE user_id = ?');
    $st->execute([$stage, $userId]);
}

/**
 * Tjek om et mål-stage er “låst op” via research.
 * Tilpas SELECT’en til din faktiske research-progress tabel og id’er.
 */
function is_stage_unlocked_by_research(PDO $pdo, int $userId, int $targetStage): bool {
    // Eksempel: stage 2 kræver at research-id 'rsd.stage.2' er fuldført.
    if ($targetStage === 2) {
        // Skift 'user_research' + 'research_id' og 'completed' til dine rigtige kolonnenavne.
        $st = $pdo->prepare('SELECT COUNT(1) FROM research WHERE user_id = ? AND rsd_id = ?');
        $st->execute([$userId, 'rsd.stage.l2']);
        return (int)$st->fetchColumn() > 0;
    }
    if ($targetStage === 3) {
        // Skift 'user_research' + 'research_id' og 'completed' til dine rigtige kolonnenavne.
        $st = $pdo->prepare('SELECT COUNT(1) FROM research WHERE user_id = ? AND rsd_id = ?');
        $st->execute([$userId, 'rsd.stage.l3']);
        return (int)$st->fetchColumn() > 0;
    }
    // Udvid med flere stages her …
    return false;
}

/**
 * Kør stage-opgradering hvis research låser op for højere stage.
 * Returnerer fx ['upgraded'=>bool, 'old'=>int, 'new'=>int, 'effects'=>[...]]
 */
function maybe_stage_upgrade(PDO $pdo, int $userId): array {
    $old = get_current_stage($pdo, $userId);
    $target = $old;

    // Trinvis: tjek 2, dernæst 3, osv. (tilpas efter behov)
    for ($s = $old + 1; $s <= 10; $s++) { // antag max 10; tilpas
        if (is_stage_unlocked_by_research($pdo, $userId, $s)) {
            $target = $s;
        } else {
            break;
        }
    }

    if ($target <= $old) {
        return ['upgraded' => false, 'old' => $old, 'new' => $old, 'effects' => []];
    }

    // Opdater brugers stage
    set_current_stage($pdo, $userId, $target);

    // Side-effekter ved skift 1 -> 2 (tilpas efter behov)
    $effects = [];
    if ($old < 2 && $target >= 2) {
        $cit = ensure_citizens_row_exists($pdo, $userId);
        $effects[] = ['type' => 'citizens_row', 'created' => $cit['created'], 'id' => $cit['id']];
        // Tilføj evt. flere effekter her (fx unlock af nye features/flags)
    }

    return ['upgraded' => true, 'old' => $old, 'new' => $target, 'effects' => $effects];
}