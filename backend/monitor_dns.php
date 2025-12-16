<?php
require 'alerts.php';

function checkDNS() {
    $domains = json_decode(file_get_contents(__DIR__.'/../data/domains.json'), true);
    $baselineFile = __DIR__.'/../data/dns_records.json';
    $baseline = file_exists($baselineFile) ? json_decode(file_get_contents($baselineFile), true) : [];

    foreach ($domains as $domain) {
        $current = dns_get_record($domain, DNS_ALL);

        if (isset($baseline[$domain]) && json_encode($baseline[$domain]) !== json_encode($current)) {
            addAlert("DNS Change", "DNS records changed for $domain", "critical");
            mail("admin@example.com", "DNS Changed", "DNS changed for $domain");
        }

        $baseline[$domain] = $current;
    }

    file_put_contents($baselineFile, json_encode($baseline, JSON_PRETTY_PRINT));
}
