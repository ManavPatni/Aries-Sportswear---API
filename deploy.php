<?php

require_once __DIR__ . '/vendor/autoload.php';

use Dotenv\Dotenv;

// Load .env
$dotenv = Dotenv::createImmutable(__DIR__);
$dotenv->load();

// Get secret from .env
$secret = $_ENV['GIT_WEBHOOK_SECRET'] ?? '';

// Initialize logging
$logFile = __DIR__ . '/deploy.log';
function logFailure($message) {
    global $logFile;
    $timestamp = date('Y-m-d H:i:s');
    file_put_contents($logFile, "[$timestamp] ERROR: $message\n", FILE_APPEND);
}

// Read headers and payload
$headers = getallheaders();
$payload = file_get_contents('php://input');
$signature = $headers['X-Hub-Signature-256'] ?? '';

// Validate signature
$expected = 'sha256=' . hash_hmac('sha256', $payload, $secret);
if (!hash_equals($expected, $signature)) {
    logFailure("Invalid signature");
    http_response_code(403);
    exit('Invalid signature');
}

// Parse payload
$data = json_decode($payload, true);
if (json_last_error() !== JSON_ERROR_NONE) {
    logFailure("Invalid JSON payload");
    http_response_code(400);
    exit('Invalid JSON payload');
}

// Check if event is a push or merge to main branch
$ref = $data['ref'] ?? '';
$event = $headers['X-GitHub-Event'] ?? '';
$isMainBranch = $ref === 'refs/heads/main';
$isMerge = $event === 'push' && isset($data['commits']) && $isMainBranch;

if ($isMainBranch && ($event === 'push' || $isMerge)) {
    // Run deployment script in background
    $output = shell_exec(__DIR__ . '/deploy.sh >> ' . $logFile . ' 2>&1 &');
    echo "Deployment triggered.";
} else {
    echo "Not main branch or not a push event.";
}