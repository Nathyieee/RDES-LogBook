<?php
// RDES LogBook - Simple auth API (users table)

declare(strict_types=1);

require __DIR__ . '/config.php';

/**
 * Very small router for auth actions.
 *
 * Accepts JSON POST with:
 *   { "action": "sign_up" | "sign_in" | "list_users" | "approve_user", ... }
 */

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    rdes_json(['ok' => false, 'message' => 'Method not allowed'], 405);
}

$input = rdes_read_json_input();
$action = $input['action'] ?? '';

try {
    $pdo = rdes_get_pdo();
} catch (Throwable $e) {
    rdes_json(['ok' => false, 'message' => 'Database connection failed'], 500);
}

switch ($action) {
    case 'sign_up':
        handle_sign_up($pdo, $input);
        break;
    case 'sign_in':
        handle_sign_in($pdo, $input);
        break;
    case 'list_users':
        handle_list_users($pdo);
        break;
    case 'approve_user':
        handle_approve_user($pdo, $input);
        break;
    default:
        rdes_json(['ok' => false, 'message' => 'Unknown action'], 400);
}

/**
 * Handle user registration.
 *
 * Expected fields:
 * - name, email, password, role ("admin" or "ojt")
 * - ojtStartTime, ojtEndTime, ojtHoursPerDay, ojtTotalHoursRequired (for OJT)
 */
function handle_sign_up(PDO $pdo, array $input): void
{
    $name = trim((string)($input['name'] ?? ''));
    $email = strtolower(trim((string)($input['email'] ?? '')));
    $password = (string)($input['password'] ?? '');
    $role = (string)($input['role'] ?? '');

    if ($name === '') {
        rdes_json(['ok' => false, 'message' => 'Name is required.'], 400);
    }
    if ($email === '') {
        rdes_json(['ok' => false, 'message' => 'Email is required.'], 400);
    }
    if ($password === '' || strlen($password) < 4) {
        rdes_json(['ok' => false, 'message' => 'Password must be at least 4 characters.'], 400);
    }
    if (!in_array($role, ['admin', 'ojt'], true)) {
        rdes_json(['ok' => false, 'message' => 'Please select a valid role.'], 400);
    }

    // Check duplicate email
    $stmt = $pdo->prepare('SELECT id FROM users WHERE email = :email LIMIT 1');
    $stmt->execute(['email' => $email]);
    if ($stmt->fetch()) {
        rdes_json(['ok' => false, 'message' => 'An account with this email already exists.'], 400);
    }

    // First admin user can be auto-approved
    $totalUsers = (int)$pdo->query('SELECT COUNT(*) FROM users')->fetchColumn();
    $isFirstUser = $totalUsers === 0;
    $approved = $isFirstUser && $role === 'admin' ? 1 : 0;

    $ojtStartTime = null;
    $ojtEndTime = null;
    $ojtHoursPerDay = null;
    $ojtTotalHoursRequired = null;

    if ($role === 'ojt') {
        $ojtStartTime = (string)($input['ojtStartTime'] ?? '');
        $ojtEndTime = (string)($input['ojtEndTime'] ?? '');
        $ojtHoursPerDay = (int)($input['ojtHoursPerDay'] ?? 0);
        $ojtTotalHoursRequired = (int)($input['ojtTotalHoursRequired'] ?? 0);

        if ($ojtStartTime === '' || $ojtEndTime === '') {
            rdes_json(['ok' => false, 'message' => 'Please enter OJT start and end time.'], 400);
        }
        if ($ojtHoursPerDay < 1 || $ojtHoursPerDay > 24) {
            rdes_json(['ok' => false, 'message' => 'Hours per day must be between 1 and 24.'], 400);
        }
        if ($ojtTotalHoursRequired < 1) {
            rdes_json(['ok' => false, 'message' => 'Total hours needed must be at least 1 hour.'], 400);
        }
    }

    // Hash password (same SHA-256 as current JS)
    $passwordHash = hash('sha256', $password);

    $insert = $pdo->prepare(
        'INSERT INTO users (name, email, password_hash, role, approved, ojt_start_time, ojt_end_time, ojt_hours_per_day, ojt_total_hours_required)
         VALUES (:name, :email, :password_hash, :role, :approved, :ojt_start_time, :ojt_end_time, :ojt_hours_per_day, :ojt_total_hours_required)'
    );

    $insert->execute([
        'name' => $name,
        'email' => $email,
        'password_hash' => $passwordHash,
        'role' => $role,
        'approved' => $approved,
        'ojt_start_time' => $ojtStartTime !== '' ? $ojtStartTime : null,
        'ojt_end_time' => $ojtEndTime !== '' ? $ojtEndTime : null,
        'ojt_hours_per_day' => $ojtHoursPerDay > 0 ? $ojtHoursPerDay : null,
        'ojt_total_hours_required' => $ojtTotalHoursRequired > 0 ? $ojtTotalHoursRequired : null,
    ]);

    $id = (int)$pdo->lastInsertId();

    $user = [
        'id' => $id,
        'name' => $name,
        'email' => $email,
        'role' => $role,
        'approved' => (bool)$approved,
        'ojtStartTime' => $ojtStartTime,
        'ojtEndTime' => $ojtEndTime,
        'ojtHoursPerDay' => $ojtHoursPerDay,
        'ojtTotalHoursRequired' => $ojtTotalHoursRequired,
    ];

    if ($approved === 1) {
        rdes_json(['ok' => true, 'user' => $user, 'redirect' => 'index.html']);
    }

    rdes_json(['ok' => true, 'user' => null, 'redirect' => 'pending-approval.html']);
}

/**
 * Handle sign in.
 */
function handle_sign_in(PDO $pdo, array $input): void
{
    $email = strtolower(trim((string)($input['email'] ?? '')));
    $password = (string)($input['password'] ?? '');

    if ($email === '' || $password === '') {
        rdes_json(['ok' => false, 'message' => 'Email and password are required.'], 400);
    }

    $stmt = $pdo->prepare('SELECT * FROM users WHERE email = :email LIMIT 1');
    $stmt->execute(['email' => $email]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$row) {
        rdes_json(['ok' => false, 'message' => 'Email not found.'], 400);
    }

    $passwordHash = hash('sha256', $password);
    if (!hash_equals($row['password_hash'], $passwordHash)) {
        rdes_json(['ok' => false, 'message' => 'Incorrect password.'], 400);
    }
    if ((int)$row['approved'] === 0) {
        rdes_json(['ok' => false, 'message' => 'Your account is pending approval by an admin.'], 403);
    }

    $user = [
        'id' => (int)$row['id'],
        'name' => $row['name'],
        'email' => $row['email'],
        'role' => $row['role'],
        'approved' => true,
    ];

    rdes_json(['ok' => true, 'user' => $user]);
}

/**
 * List users for admin screen.
 */
function handle_list_users(PDO $pdo): void
{
    $stmt = $pdo->query('SELECT name, email, role, approved FROM users ORDER BY name ASC');
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

    $users = array_map(static function (array $row): array {
        return [
            'name' => $row['name'],
            'email' => $row['email'],
            'role' => $row['role'],
            'approved' => (bool)$row['approved'],
        ];
    }, $rows);

    rdes_json(['ok' => true, 'users' => $users]);
}

/**
 * Approve a user (set approved = 1).
 */
function handle_approve_user(PDO $pdo, array $input): void
{
    $email = strtolower(trim((string)($input['email'] ?? '')));
    if ($email === '') {
        rdes_json(['ok' => false, 'message' => 'Email is required.'], 400);
    }

    $stmt = $pdo->prepare('UPDATE users SET approved = 1 WHERE email = :email');
    $stmt->execute(['email' => $email]);

    if ($stmt->rowCount() === 0) {
        rdes_json(['ok' => false, 'message' => 'User not found.'], 404);
    }

    rdes_json(['ok' => true]);
}

