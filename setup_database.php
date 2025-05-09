<?php

// Retrieve database connection details from environment variables
$db_host = getenv('DB_HOST');
$db_username = getenv('DB_USERNAME');
$db_password = getenv('DB_PASSWORD');
$db_database = getenv('DB_DATABASE');

// Validate that all required environment variables are set
if (!$db_host || !$db_username || !$db_password || !$db_database) {
    fwrite(STDERR, "Missing database environment variables\n");
    exit(1);
}

// Establish a database connection using PDO
try {
    $pdo = new PDO("mysql:host=$db_host;port=$db_port;dbname=$db_database", $db_username, $db_password);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
} catch (PDOException $e) {
    fwrite(STDERR, "Database connection failed: " . $e->getMessage() . "\n");
    exit(1);
}

// Set SQL mode and time zone as per the SQL dump
try {
    $pdo->exec('SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";');
    $pdo->exec('SET time_zone = "+00:00";');
} catch (PDOException $e) {
    fwrite(STDERR, "Failed to set SQL mode or time zone: " . $e->getMessage() . "\n");
    exit(1);
}

// Define the tables to be created
$tables = [
    'staff' => "
CREATE TABLE `staff` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `email` varchar(320) NOT NULL,
  `password_hash` text NOT NULL,
  `name` varchar(255) DEFAULT NULL,
  `avatar` varchar(255) DEFAULT NULL,
  `role` enum('super_admin','admin') NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
",
    'users' => "
CREATE TABLE `users` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `email` varchar(320) NOT NULL,
  `password_hash` text NOT NULL,
  `name` varchar(255) DEFAULT NULL,
  `avatar` varchar(255) DEFAULT NULL,
  `address` text DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
",
    'staff_refresh_tokens' => "
CREATE TABLE `staff_refresh_tokens` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `staff_id` bigint(20) NOT NULL,
  `token_hash` char(64) NOT NULL,
  `expires_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `staff_id` (`staff_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
",
    'user_refresh_tokens' => "
CREATE TABLE `user_refresh_tokens` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `user_id` bigint(20) NOT NULL,
  `token_hash` char(64) NOT NULL,
  `expires_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `user_id` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
"
];

// Define foreign key constraints
$constraints = [
    [
        'table' => 'staff_refresh_tokens',
        'constraint_name' => 'staff_refresh_tokens_ibfk_1',
        'sql' => "ALTER TABLE `staff_refresh_tokens` ADD CONSTRAINT `staff_refresh_tokens_ibfk_1` FOREIGN KEY (`staff_id`) REFERENCES `staff` (`id`) ON DELETE CASCADE;"
    ],
    [
        'table' => 'user_refresh_tokens',
        'constraint_name' => 'refresh_tokens_ibfk_1',
        'sql' => "ALTER TABLE `user_refresh_tokens` ADD CONSTRAINT `refresh_tokens_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE;"
    ]
];

// Process tables and constraints
try {
    // Note: MySQL DDL statements (CREATE TABLE, ALTER TABLE) are auto-committed and cannot be rolled back in a transaction.
    // We'll simulate a transaction-like behavior by checking existence and stopping on first failure.

    // Create tables if they don't exist
    foreach ($tables as $table_name => $create_sql) {
        $stmt = $pdo->prepare("SELECT * FROM information_schema.tables WHERE table_schema = :db AND table_name = :table");
        $stmt->execute(['db' => $db_database, 'table' => $table_name]);
        if ($stmt->rowCount() == 0) {
            $pdo->exec($create_sql);
            echo "Created table $table_name\n";
        } else {
            echo "Table $table_name already exists\n";
        }
    }

    // Add constraints if they don't exist
    foreach ($constraints as $constraint) {
        $stmt = $pdo->prepare("SELECT * FROM information_schema.table_constraints WHERE constraint_schema = :db AND table_name = :table AND constraint_name = :constraint");
        $stmt->execute(['db' => $db_database, 'table' => $constraint['table'], 'constraint' => $constraint['constraint_name']]);
        if ($stmt->rowCount() == 0) {
            $pdo->exec($constraint['sql']);
            echo "Added constraint {$constraint['constraint_name']} to table {$constraint['table']}\n";
        } else {
            echo "Constraint {$constraint['constraint_name']} already exists on table {$constraint['table']}\n";
        }
    }

    echo "Database setup completed successfully\n";
} catch (PDOException $e) {
    // Log error and exit on failure
    fwrite(STDERR, "Database setup failed: " . $e->getMessage() . "\n");
    exit(1);
}