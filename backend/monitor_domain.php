<?php
require 'alerts.php';

function checkDomainExpiry() {
    $domains = json_decode(file_get_contents(__DIR__.'/../data/domains.json'), true);

    foreach ($domains as $domain) {
        $whois = shell_exec("whois $domain");
        if (preg_match('/Expiry Date:\s*(.+)/i', $whois, $m)) {
            $expiry = new DateTime(trim($m[1]));
            $days = (new DateTime())->diff($expiry)->days;

            if (in_array($days, [60,30,14,7])) {
                addAlert("Domain Expiry", "$domain expires in $days days", "critical");
                mail("admin@example.com", "Domain Expiry", "$domain expires in $days days");
            }
        }
    }
}
