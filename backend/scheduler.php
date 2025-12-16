<?php
require 'monitor_dns.php';
require 'monitor_ssl.php';
require 'monitor_domain.php';

checkDNS();
checkSSL();
checkDomainExpiry();
