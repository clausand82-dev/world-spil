<?php
declare(strict_types=1);

/**
 * Sikrer at der findes en række i citizens for user_id.
 * Returnerer ['created'=>bool, 'id'=>int].
 */
function ensure_citizens_row_exists(PDO $pdo, int $userId): array {
    $st = $pdo->prepare('SELECT id FROM citizens WHERE user_id = ? LIMIT 1');
    $st->execute([$userId]);
    $row = $st->fetch(PDO::FETCH_ASSOC);
    if ($row) {
        return ['created' => false, 'id' => (int)$row['id']];
    }

    $sql = '
      INSERT INTO citizens (
        user_id,
        `baby`,`kidsStreet`,`kidsStudent`,`youngStudent`,`youngWorker`,`old`,
        `adultsPolice`,`crimePolice`,`adultsFire`,`crimeFire`,
        `adultsHealth`,`crimeHealth`,`adultsSoldier`,`crimeSoldier`,
        `adultsGovernment`,`crimeGovernment`,`adultsPolitician`,`crimePolitician`,
        `adultsUnemployed`,`crimeUnemployed`,`adultsWorker`,`crimeWorker`,
        `adultsHomeless`,`crimeHomeless`,
        lastupdated
      ) VALUES (
        ?,  /* user_id */
        0,0,0,0,0,0,
        0,0,0,0,
        0,0,0,0,
        0,0,0,0,
        0,0,0,0,
        0, /* adultsHomeless */ 0, /* crimeHomeless */
        UTC_TIMESTAMP()
      )
    ';
    $ins = $pdo->prepare($sql);
    $ins->execute([$userId]);
    return ['created' => true, 'id' => (int)$pdo->lastInsertId()];
}