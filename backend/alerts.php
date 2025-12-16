<?php
function addAlert($type, $message, $severity = "warning") {
    $file = __DIR__ . '/../data/alerts.json';
    $alerts = file_exists($file) ? json_decode(file_get_contents($file), true) : [];

    $alerts[] = [
        "type" => $type,
        "message" => $message,
        "severity" => $severity,
        "time" => date("Y-m-d H:i:s")
    ];

    file_put_contents($file, json_encode($alerts, JSON_PRETTY_PRINT));
}
