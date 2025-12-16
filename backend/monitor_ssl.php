<?php
require 'alerts.php';

function checkSSL() {
    $domains = json_decode(file_get_contents(__DIR__.'/../data/domains.json'), true);

    foreach ($domains as $domain) {
        $ctx = stream_context_create(["ssl" => ["capture_peer_cert" => true]]);
        $client = @stream_socket_client("ssl://$domain:443", $errno, $errstr, 10, STREAM_CLIENT_CONNECT, $ctx);

        if (!$client) continue;

        $cert = stream_context_get_params($client)['options']['ssl']['peer_certificate'];
        $data = openssl_x509_parse($cert);
        $expiry = new DateTime("@".$data['validTo_time_t']);
        $days = (new DateTime())->diff($expiry)->days;

        if (in_array($days, [30,14,7])) {
            addAlert("SSL Expiry", "$domain SSL expires in $days days", "warning");
            mail("admin@example.com", "SSL Expiry Warning", "$domain SSL expires in $days days");
        }
    }
}
