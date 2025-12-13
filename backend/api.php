<?php
ini_set('display_errors', '0'); // Prevent error messages from being output to response

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *'); // CORS for localhost dev; restrict in prod
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE');
header('Access-Control-Allow-Headers: Content-Type');

// Rate limiting: Simple session-based (max 60 req/min)
session_start();
if (!isset($_SESSION['requests'])) $_SESSION['requests'] = [];
$_SESSION['requests'][] = time();
$_SESSION['requests'] = array_filter($_SESSION['requests'], fn($t) => $t > time() - 60);
if (count($_SESSION['requests']) > 60) {
    http_response_code(429);
    echo json_encode(['error' => 'Rate limit exceeded']);
    exit;
}

// JSON storage
$devicesFile = __DIR__ . '/devices.json';

// Safely initialize devices
$devices = [];
if (file_exists($devicesFile)) {
    $content = @file_get_contents($devicesFile); // Suppress warning if fails
    if ($content !== false) {
        $devices = json_decode($content, true) ?? [];
    }
} else {
    @file_put_contents($devicesFile, json_encode([])); // Suppress if write fails (e.g., permissions)
}

// Improved Routing: Strip script name from path
$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$script_name = '/backend/api.php';
$resource_path = str_replace($script_name, '', $path);
$parts = explode('/', trim($resource_path, '/'));
$resource = $parts[0] ?? '';
$id = $parts[1] ?? null;
$method = $_SERVER['REQUEST_METHOD'];

// Sanitize inputs
function sanitize($input) {
    return htmlspecialchars(trim($input), ENT_QUOTES, 'UTF-8');
}

if ($resource === 'devices') {
    if ($method === 'GET') {
        echo json_encode(array_values($devices)); // List all
    } elseif ($method === 'POST') {
        $data = json_decode(file_get_contents('php://input'), true);
        $newId = count($devices) + 1;
        $devices[$newId] = [
            'id' => $newId,
            'name' => sanitize($data['name']),
            'host' => sanitize($data['host']),
            'snmp_enabled' => (bool) $data['snmp_enabled'],
            'snmp_community' => sanitize($data['snmp_community'] ?? 'public'),
            'snmp_version' => sanitize($data['snmp_version'] ?? '2c')
        ];
        @file_put_contents($devicesFile, json_encode($devices));
        echo json_encode(['success' => true]);
    } elseif ($method === 'PUT' && $id) {
        $data = json_decode(file_get_contents('php://input'), true);
        if (isset($devices[$id])) {
            $devices[$id]['name'] = sanitize($data['name']);
            $devices[$id]['host'] = sanitize($data['host']);
            $devices[$id]['snmp_enabled'] = (bool) $data['snmp_enabled'];
            $devices[$id]['snmp_community'] = sanitize($data['snmp_community'] ?? 'public');
            $devices[$id]['snmp_version'] = sanitize($data['snmp_version'] ?? '2c');
            @file_put_contents($devicesFile, json_encode($devices));
            echo json_encode(['success' => true]);
        } else {
            http_response_code(404);
            echo json_encode(['error' => 'Device not found']);
        }
    } elseif ($method === 'DELETE' && $id) {
        if (isset($devices[$id])) {
            unset($devices[$id]);
            @file_put_contents($devicesFile, json_encode($devices));
            echo json_encode(['success' => true]);
        } else {
            http_response_code(404);
            echo json_encode(['error' => 'Device not found']);
        }
    }
} elseif ($resource === 'ping') {
    $host = sanitize($_GET['host'] ?? '');
    if (!$host) {
        http_response_code(400);
        echo json_encode(['error' => 'Host required']);
        exit;
    }

    // ICMP ping (Linux: ping -c1 -W1; Windows: ping -n1 -w1000)
    $os = PHP_OS_FAMILY === 'Windows' ? 'win' : 'linux';
    $cmd = $os === 'win' 
        ? "ping -n 1 -w 1000 " . escapeshellarg($host)
        : "ping -c 1 -W 1 " . escapeshellarg($host);
    exec($cmd, $output, $return);

    $alive = $return === 0;
    $latency = null;
    $lastSeen = $alive ? date('Y-m-d H:i:s') : null;

    if ($alive) {
        foreach ($output as $line) {
            if (preg_match('/time=([\d.]+) ?ms/i', $line, $matches)) {
                $latency = (float) $matches[1];
                break;
            }
        }
    }

    echo json_encode(['alive' => $alive, 'latency' => $latency, 'last_seen' => $lastSeen]);
} elseif ($resource === 'traceroute') {
    $host = sanitize($_GET['host'] ?? '');
    if (!$host) {
        http_response_code(400);
        echo json_encode(['error' => 'Host required']);
        exit;
    }

    // Traceroute (Linux: traceroute -w1; Windows: tracert -w1000)
    $os = PHP_OS_FAMILY === 'Windows' ? 'win' : 'linux';
    $cmd = $os === 'win' 
        ? "tracert -w 1000 " . escapeshellarg($host)
        : "traceroute -w 1 " . escapeshellarg($host);
    exec($cmd, $output);

    echo json_encode(['output' => implode("\n", $output)]);
} elseif ($resource === 'snmp') {
    if (!function_exists('snmpget')) {
        echo json_encode(['error' => 'SNMP extension not installed']);
        exit;
    }

    $host = sanitize($_GET['host'] ?? '');
    $community = sanitize($_GET['community'] ?? 'public');
    $version = $_GET['version'] ?? '2c';

    if (!$host) {
        http_response_code(400);
        echo json_encode(['error' => 'Host required']);
        exit;
    }

    // Standard OIDs for first interface (expandable)
    $inOid = '.1.3.6.1.2.1.2.2.1.10.1';
    $outOid = '.1.3.6.1.2.1.2.2.1.16.1';

    $inOctets = @snmpget($host, $community, $inOid, 1000000, 3); // Suppress if fails
    $outOctets = @snmpget($host, $community, $outOid, 1000000, 3);

    // Parse values (snmpget returns "INTEGER: value")
    $inValue = $inOctets ? (int) preg_replace('/[^0-9]/', '', $inOctets) : null;
    $outValue = $outOctets ? (int) preg_replace('/[^0-9]/', '', $outOctets) : null;

    echo json_encode([
        'in_octets' => $inValue,
        'out_octets' => $outValue,
        // Add port stats here if expanded (e.g., snmpwalk for all interfaces)
    ]);
} else {
    http_response_code(404);
    echo json_encode(['error' => 'Not found']);
}
