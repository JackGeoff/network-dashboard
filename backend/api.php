<?php
ini_set('display_errors', '0');

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE');
header('Access-Control-Allow-Headers: Content-Type');

session_start();

$_SESSION['r'] = $_SESSION['r'] ?? [];
$_SESSION['r'][] = time();
$_SESSION['r'] = array_filter($_SESSION['r'], fn($t) => $t > time() - 60);
if (count($_SESSION['r']) > 60) {
    http_response_code(429);
    echo json_encode(['error' => 'Rate limit']);
    exit;
}

$devicesFile = __DIR__ . '/devices.json';
$devices = file_exists($devicesFile)
    ? json_decode(file_get_contents($devicesFile), true) ?? []
    : [];

function saveDevices($d, $f) {
    file_put_contents($f, json_encode($d));
}

function clean($v) {
    return htmlspecialchars(trim($v), ENT_QUOTES);
}

$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$base = '/backend/api.php';
$route = trim(str_replace($base, '', $path), '/');
$parts = explode('/', $route);

$resource = $parts[0] ?? '';
$id = $parts[1] ?? null;
$method = $_SERVER['REQUEST_METHOD'];

/* ---------- DEVICES ---------- */
if ($resource === 'devices') {

    if ($method === 'GET') {
        echo json_encode(array_values($devices));
        exit;
    }

    $data = json_decode(file_get_contents('php://input'), true);

    if ($method === 'POST') {
        $id = count($devices) + 1;
        $devices[$id] = [
            'id' => $id,
            'name' => clean($data['name']),
            'host' => clean($data['host']),
            'port' => (int)($data['port'] ?? 80),
            'snmp_enabled' => (bool)$data['snmp_enabled'],
            'snmp_community' => clean($data['snmp_community'] ?? 'public'),
            'snmp_version' => clean($data['snmp_version'] ?? '2c')
        ];
        saveDevices($devices, $devicesFile);
        echo json_encode(['success' => true]);
        exit;
    }

    if ($method === 'PUT' && isset($devices[$id])) {
        $devices[$id] = array_merge($devices[$id], [
            'name' => clean($data['name']),
            'host' => clean($data['host']),
            'port' => (int)($data['port'] ?? 80),
            'snmp_enabled' => (bool)$data['snmp_enabled'],
            'snmp_community' => clean($data['snmp_community'] ?? 'public'),
            'snmp_version' => clean($data['snmp_version'] ?? '2c')
        ]);
        saveDevices($devices, $devicesFile);
        echo json_encode(['success' => true]);
        exit;
    }

    if ($method === 'DELETE' && isset($devices[$id])) {
        unset($devices[$id]);
        saveDevices($devices, $devicesFile);
        echo json_encode(['success' => true]);
        exit;
    }
}

/* ---------- TCP STATUS CHECK ---------- */
if ($resource === 'ping') {
    $host = clean($_GET['host'] ?? '');
    $port = (int)($_GET['port'] ?? 80);

    if (!$host) {
        echo json_encode(['error' => 'Host required']);
        exit;
    }

    $start = microtime(true);
    $fp = @fsockopen($host, $port, $errno, $errstr, 1);
    $latency = round((microtime(true) - $start) * 1000, 2);

    if ($fp) {
        fclose($fp);
        echo json_encode([
            'alive' => true,
            'latency' => $latency,
            'last_seen' => date('Y-m-d H:i:s')
        ]);
    } else {
        echo json_encode([
            'alive' => false,
            'latency' => null,
            'last_seen' => null
        ]);
    }
    exit;
}

/* ---------- TRACEROUTE ---------- */
if ($resource === 'traceroute') {
    $host = clean($_GET['host'] ?? '');
    exec("traceroute -w 1 " . escapeshellarg($host), $out);
    echo json_encode(['output' => implode("\n", $out)]);
    exit;
}

/* ---------- SNMP ---------- */
if ($resource === 'snmp') {
    if (!function_exists('snmpget')) {
        echo json_encode(['error' => 'SNMP not installed']);
        exit;
    }

    $host = clean($_GET['host'] ?? '');
    $community = clean($_GET['community'] ?? 'public');

    $in = @snmpget($host, $community, '.1.3.6.1.2.1.2.2.1.10.1');
    $out = @snmpget($host, $community, '.1.3.6.1.2.1.2.2.1.16.1');

    echo json_encode([
        'in_octets' => $in ? (int)preg_replace('/\D/', '', $in) : null,
        'out_octets' => $out ? (int)preg_replace('/\D/', '', $out) : null
    ]);
    exit;
}

http_response_code(404);
echo json_encode(['error' => 'Not found']);
