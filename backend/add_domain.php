<?php
$data = json_decode(file_get_contents("php://input"), true);
$domain = strtolower(trim($data['domain'] ?? ''));

if (!$domain) {
    echo json_encode(["message" => "Invalid domain"]);
    exit;
}

$file = __DIR__ . '/../data/domains.json';
$domains = file_exists($file) ? json_decode(file_get_contents($file), true) : [];

if (!in_array($domain, $domains)) {
    $domains[] = $domain;
    file_put_contents($file, json_encode($domains, JSON_PRETTY_PRINT));
}

echo json_encode(["message" => "Domain added successfully"]);
