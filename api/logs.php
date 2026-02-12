<?php
// RDES LogBook - Log entries API (log_entries table)

declare(strict_types=1);

require __DIR__ . '/config.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    rdes_json(['ok' => false, 'message' => 'Method not allowed'], 405);
}

$input  = rdes_read_json_input();
$action = $input['action'] ?? '';

try {
    $pdo = rdes_get_pdo();
} catch (Throwable $e) {
    rdes_json(['ok' => false, 'message' => 'Database connection failed'], 500);
}

switch ($action) {
    case 'add_entry':
        handle_add_entry($pdo, $input);
        break;
    case 'list_entries':
        handle_list_entries($pdo);
        break;
    default:
        rdes_json(['ok' => false, 'message' => 'Unknown action'], 400);
}

/**
 * Add a new time log entry.
 *
 * Expected JSON:
 * {
 *   "userId": 1,
 *   "name": "Juan Dela Cruz",
 *   "logAction": "time_in" | "time_out",
 *   "timestamp": "2026-02-12T08:00:00.000Z" // optional; server will use now() if missing
 * }
 */
function handle_add_entry(PDO $pdo, array $input): void
{
    $userId    = (int)($input['userId'] ?? 0);
    $name      = trim((string)($input['name'] ?? ''));
    $logAction = (string)($input['logAction'] ?? '');
    $tsString  = (string)($input['timestamp'] ?? '');

    if ($userId <= 0 || $name === '') {
        rdes_json(['ok' => false, 'message' => 'User is required. Please sign in again.'], 400);
    }
    if (!in_array($logAction, ['time_in', 'time_out'], true)) {
        rdes_json(['ok' => false, 'message' => 'Invalid action.'], 400);
    }

    // Parse timestamp from client or fallback to now (Asia/Manila).
    $dt = null;
    if ($tsString !== '') {
        try {
            $dt = new DateTime($tsString);
        } catch (Exception $e) {
            $dt = null;
        }
    }
    if (!$dt) {
        $dt = new DateTime('now', new DateTimeZone('Asia/Manila'));
    }

    $entryDate = $dt->format('Y-m-d');
    $entryTime = $dt->format('H:i:s');
    $createdAt = $dt->format('Y-m-d H:i:s');

    $stmt = $pdo->prepare(
        'INSERT INTO log_entries (user_id, action, entry_date, entry_time, created_at, notes)
         VALUES (:user_id, :action, :entry_date, :entry_time, :created_at, :notes)'
    );

    $stmt->execute([
        'user_id'    => $userId,
        'action'     => $logAction,
        'entry_date' => $entryDate,
        'entry_time' => $entryTime,
        'created_at' => $createdAt,
        'notes'      => null,
    ]);

    $id = (int)$pdo->lastInsertId();

    // Return an entry object similar to what the JS code expects.
    $entry = [
        'id'        => $id,
        'name'      => $name,
        'action'    => $logAction,
        'timestamp' => $dt->format(DateTime::ATOM),
        'date'      => $entryDate,
        'time'      => $entryTime,
    ];

    rdes_json(['ok' => true, 'entry' => $entry]);
}

/**
 * List all log entries (used by logbook, my-record, profile pages).
 */
function handle_list_entries(PDO $pdo): void
{
    $sql = 'SELECT le.id,
                   le.user_id,
                   u.name AS user_name,
                   le.action,
                   le.entry_date,
                   le.entry_time,
                   le.created_at
            FROM log_entries le
            LEFT JOIN users u ON le.user_id = u.id
            ORDER BY le.created_at DESC';

    $stmt = $pdo->query($sql);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

    $entries = [];
    foreach ($rows as $row) {
        $created = $row['created_at'] ?? ($row['entry_date'] . ' ' . $row['entry_time']);
        try {
            $dt = new DateTime($created);
        } catch (Exception $e) {
            $dt = new DateTime('now', new DateTimeZone('Asia/Manila'));
        }

        $entries[] = [
            'id'        => (string)$row['id'],
            'name'      => $row['user_name'] ?? '',
            'action'    => $row['action'],
            'timestamp' => $dt->format(DateTime::ATOM),
            'date'      => $row['entry_date'],
            'time'      => $row['entry_time'],
        ];
    }

    rdes_json(['ok' => true, 'entries' => $entries]);
}

