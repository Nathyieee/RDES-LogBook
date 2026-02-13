<?php
// RDES LogBook - PHP config & common helpers

declare(strict_types=1);

// TODO: Update these values to match your MySQL database.
// HOST = MySQL server address.  NAME = database name (not the server).
const RDES_DB_HOST = 'sql309.byetcluster.com';
const RDES_DB_NAME = 'if0_41145475_RDES_Logs';
const RDES_DB_USER = 'if0_41145475';
const RDES_DB_PASS = '123456789RDES';

// Campus geolocation: Time In/Out allowed only within this range (OJT only).
// Batangas State University - Lipa Campus (A Tanco Dr, Maraouy, Lipa City, Batangas).
define('RDES_CAMPUS_LAT', 13.95668);
define('RDES_CAMPUS_LNG', 121.16301);
define('RDES_CAMPUS_RADIUS_METERS', 150);

/**
 * Distance in meters between two lat/lng points (Haversine).
 *
 * @param float $lat1
 * @param float $lon1
 * @param float $lat2
 * @param float $lon2
 * @return float
 */
function rdes_distance_meters(float $lat1, float $lon1, float $lat2, float $lon2): float
{
    $earthRadius = 6371000; // meters
    $dLat = deg2rad($lat2 - $lat1);
    $dLon = deg2rad($lon2 - $lon1);
    $a = sin($dLat / 2) * sin($dLat / 2)
         + cos(deg2rad($lat1)) * cos(deg2rad($lat2))
         * sin($dLon / 2) * sin($dLon / 2);
    $c = 2 * atan2(sqrt($a), sqrt(1 - $a));
    return $earthRadius * $c;
}

/**
 * Get a shared PDO instance.
 *
 * @return PDO
 */
function rdes_get_pdo(): PDO
{
    static $pdo = null;
    if ($pdo instanceof PDO) {
        return $pdo;
    }

    $dsn = 'mysql:host=' . RDES_DB_HOST . ';dbname=' . RDES_DB_NAME . ';charset=utf8mb4';

    $options = [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES   => false,
    ];

    $pdo = new PDO($dsn, RDES_DB_USER, RDES_DB_PASS, $options);
    return $pdo;
}

/**
 * Send a JSON response and exit.
 *
 * @param mixed $data
 * @param int   $status
 * @return void
 */
function rdes_json($data, int $status = 200): void
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    // Allow CORS during development; tighten this in production if needed.
    header('Access-Control-Allow-Origin: *');
    header('Access-Control-Allow-Headers: Content-Type, Authorization');
    header('Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS');

    echo json_encode($data);
    exit;
}

/**
 * Read JSON from the request body.
 *
 * @return array<string,mixed>
 */
function rdes_read_json_input(): array
{
    $raw = file_get_contents('php://input');
    if ($raw === false || $raw === '') {
        return [];
    }
    $data = json_decode($raw, true);
    if (!is_array($data)) {
        return [];
    }
    /** @var array<string,mixed> $data */
    return $data;
}

/**
 * Get Bearer token from Authorization header, if present.
 *
 * @return string|null
 */
function rdes_get_bearer_token(): ?string
{
    $header = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['Authorization'] ?? '';
    if (stripos($header, 'Bearer ') === 0) {
        return trim(substr($header, 7));
    }
    return null;
}

