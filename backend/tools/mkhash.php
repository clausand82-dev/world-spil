<?php
// Kør: http://localhost/.../backend/tools/mkhash.php?pwd=NYKODE
$pwd = $_GET['pwd'] ?? '';
if ($pwd === '') { echo "Give ?pwd="; exit; }
echo password_hash($pwd, PASSWORD_DEFAULT);