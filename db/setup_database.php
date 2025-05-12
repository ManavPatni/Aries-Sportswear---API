<?php

require_once __DIR__ . '/vendor/autoload.php';

use Dotenv\Dotenv;

define('REQUIRED_ENV_VARS', ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_DATABASE', 'DB_PORT']);

// Load environment variables
$dotenv = Dotenv::createImmutable(__DIR__);
$dotenv->load();

// Validate required environment variables
foreach (REQUIRED_ENV_VARS as $var) {
    if (empty($_ENV[$var])) {
        fwrite(STDERR, "Missing environment variable: $var\n");
        exit(1);
    }
}

$db_host = $_ENV['DB_HOST'];
$db_port = $_ENV['DB_PORT'];
$db_username = $_ENV['DB_USER'];
$db_password = $_ENV['DB_PASSWORD'];
$db_database = $_ENV['DB_DATABASE'];

// Database connection
try {
    $dsn = "mysql:host=$db_host;port=$db_port;dbname=$db_database;charset=utf8mb4";
    $pdo = new PDO($dsn, $db_username, $db_password, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION
    ]);
} catch (PDOException $e) {
    fwrite(STDERR, "Database connection failed: " . $e->getMessage() . "\n");
    exit(1);
}

// Set SQL mode and time zone
try {
    $pdo->exec('SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";');
    $pdo->exec('SET time_zone = "+00:00";');
} catch (PDOException $e) {
    fwrite(STDERR, "Failed to set SQL mode or time zone: " . $e->getMessage() . "\n");
    exit(1);
}

// Table definitions
$tables = [
    'staff' => <<<SQL
CREATE TABLE `staff` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `email` VARCHAR(320) NOT NULL,
    `password_hash` TEXT NOT NULL,
    `name` VARCHAR(255) DEFAULT NULL,
    `avatar` VARCHAR(255) DEFAULT NULL,
    `role` ENUM('super_admin','admin') NOT NULL,
    `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
SQL,

    'users' => <<<SQL
CREATE TABLE `users` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `email` VARCHAR(320) NOT NULL,
    `password_hash` TEXT NOT NULL,
    `name` VARCHAR(255) DEFAULT NULL,
    `avatar` VARCHAR(255) DEFAULT NULL,
    `address` TEXT DEFAULT NULL,
    `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
SQL,

    'staff_refresh_tokens' => <<<SQL
CREATE TABLE `staff_refresh_tokens` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `staff_id` BIGINT NOT NULL,
    `token_hash` CHAR(64) NOT NULL,
    `expires_at` TIMESTAMP NOT NULL,
    `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `staff_id` (`staff_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
SQL,

    'user_refresh_tokens' => <<<SQL
CREATE TABLE `user_refresh_tokens` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `user_id` BIGINT NOT NULL,
    `token_hash` CHAR(64) NOT NULL,
    `expires_at` TIMESTAMP NOT NULL,
    `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `user_id` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
SQL,

    'verification_requests' => <<<SQL
CREATE TABLE `verification_requests` (
  `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
  `email` VARCHAR(320) NOT NULL,
  `otp_hash` CHAR(60) NOT NULL,
  `role` ENUM('user', 'staff') NOT NULL,
  `ip` VARCHAR(45),
  `user_agent` TEXT,
  `expires_at` TIMESTAMP NOT NULL,
  `verified` BOOLEAN DEFAULT FALSE,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX (`email`),
  INDEX (`ip`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
SQL
];

// Constraint definitions
$constraints = [
    [
        'type' => 'foreign_key',
        'table' => 'staff_refresh_tokens',
        'name' => 'fk_staff_refresh_tokens_staff_id',
        'sql' => "ALTER TABLE `staff_refresh_tokens` ADD CONSTRAINT `fk_staff_refresh_tokens_staff_id` FOREIGN KEY (`staff_id`) REFERENCES `staff` (`id`) ON DELETE CASCADE;"
    ],
    [
        'type' => 'foreign_key',
        'table' => 'user_refresh_tokens',
        'name' => 'fk_user_refresh_tokens_user_id',
        'sql' => "ALTER TABLE `user_refresh_tokens` ADD CONSTRAINT `fk_user_refresh_tokens_user_id` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE;"
    ],
    [
        'type' => 'index',
        'table' => 'user_refresh_tokens',
        'name' => 'idx_user_tokens_expires_at',
        'sql' => 'CREATE INDEX idx_user_tokens_expires_at ON user_refresh_tokens (expires_at);'
    ],
    [
        'type' => 'index',
        'table' => 'staff_refresh_tokens',
        'name' => 'idx_staff_tokens_expires_at',
        'sql' => 'CREATE INDEX idx_staff_tokens_expires_at ON staff_refresh_tokens (expires_at);'
    ]
];

// Helper: check if table exists
function tableExists(PDO $pdo, string $db, string $table): bool {
    $stmt = $pdo->prepare("SELECT 1 FROM information_schema.tables WHERE table_schema = :db AND table_name = :table");
    $stmt->execute(['db' => $db, 'table' => $table]);
    return $stmt->fetchColumn() !== false;
}

// Helper: check if constraint or index exists
function constraintExists(PDO $pdo, string $db, string $table, string $name, string $type): bool {
    $query = match ($type) {
        'foreign_key' => "SELECT 1 FROM information_schema.table_constraints WHERE constraint_schema = :db AND table_name = :table AND constraint_name = :name",
        'index' => "SELECT 1 FROM information_schema.statistics WHERE table_schema = :db AND table_name = :table AND index_name = :name",
        default => null
    };

    if (!$query) return false;

    $stmt = $pdo->prepare($query);
    $stmt->execute(['db' => $db, 'table' => $table, 'name' => $name]);
    return $stmt->fetchColumn() !== false;
}

// Create tables
foreach ($tables as $table => $sql) {
    if (!tableExists($pdo, $db_database, $table)) {
        $pdo->exec($sql);
        echo "Created table: $table\n";
    } else {
        echo "Table exists: $table\n";
    }
}

// Apply constraints and indexes
foreach ($constraints as $c) {
    if (!constraintExists($pdo, $db_database, $c['table'], $c['name'], $c['type'])) {
        $pdo->exec($c['sql']);
        echo "Applied {$c['type']}: {$c['name']} on {$c['table']}\n";
    } else {
        echo "{$c['type']} exists: {$c['name']} on {$c['table']}\n";
    }
}

echo "\nDatabase setup completed successfully.\n";