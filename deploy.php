<?php

require_once __DIR__ . '/vendor/autoload.php';

use Dotenv\Dotenv;

// Load .env
$dotenv = Dotenv::createImmutable(__DIR__);
$dotenv->load();

// Get secret from .env
$secret = $_ENV['GIT_WEBHOOK_SECRET'] ?? '';

// Read headers and payload
$headers = getallheaders();
$payload = file_get_contents('php://input');
$signature = $headers['X-Hub-Signature-256'] ?? '';

// Validate signature
$expected = 'sha256=' . hash_hmac('sha256', $payload, $secret);
if (!hash_equals($expected, $signature)) {
    http_response_code(403);
    exit('Invalid signature');
}

// Check if push is on 'main' branch
$data = json_decode($payload, true);
$ref = $data['ref'] ?? '';
if ($ref === 'refs/heads/main') {
    shell_exec(__DIR__ . '/deploy.sh > /dev/null 2>&1 &');
    echo "Deployment triggered.";
} else {
    echo "Not main branch.";
}