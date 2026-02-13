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
    case 'add_entry_manual':
        handle_add_entry_manual($pdo, $input);
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
 *   userId, name, logAction ("time_in"|"time_out"), timestamp (optional)
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
 * Admin-only: add a time log entry for a past date/time (e.g. to backfill missing days).
 *
 * Expected JSON:
 *   createdByUserId (admin's user id), userEmail (OJT email), logAction, entryDate (Y-m-d), entryTime (H:i or H:i:s)
 */
function handle_add_entry_manual(PDO $pdo, array $input): void
{
    $adminId = (int)($input['createdByUserId'] ?? 0);
    if ($adminId <= 0) {
        rdes_json(['ok' => false, 'message' => 'Admin session required.'], 403);
    }
    $stmt = $pdo->prepare('SELECT role FROM users WHERE id = :id LIMIT 1');
    $stmt->execute(['id' => $adminId]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$row || $row['role'] !== 'admin') {
        rdes_json(['ok' => false, 'message' => 'Only admins can add manual entries.'], 403);
    }

    $userEmail = strtolower(trim((string)($input['userEmail'] ?? '')));
    if ($userEmail === '') {
        rdes_json(['ok' => false, 'message' => 'Please select a user.'], 400);
    }
    $stmt = $pdo->prepare('SELECT id, name FROM users WHERE email = :email LIMIT 1');
    $stmt->execute(['email' => $userEmail]);
    $user = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$user) {
        rdes_json(['ok' => false, 'message' => 'User not found.'], 404);
    }
    $userId = (int)$user['id'];
    $name   = (string)$user['name'];

    $logAction = (string)($input['logAction'] ?? '');
    if (!in_array($logAction, ['time_in', 'time_out'], true)) {
        rdes_json(['ok' => false, 'message' => 'Invalid action. Choose Time In or Time Out.'], 400);
    }

    $entryDate = trim((string)($input['entryDate'] ?? ''));
    $entryTime = trim((string)($input['entryTime'] ?? ''));
    if ($entryDate === '' || $entryTime === '') {
        rdes_json(['ok' => false, 'message' => 'Date and time are required.'], 400);
    }
    $dt = null;
    try {
        $dt = new DateTime($entryDate . ' ' . $entryTime, new DateTimeZone('Asia/Manila'));
    } catch (Exception $e) {
        rdes_json(['ok' => false, 'message' => 'Invalid date or time format.'], 400);
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
    $entry = [
        'id'        => $id,
        'name'      => $name,
        'action'    => $logAction,
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
