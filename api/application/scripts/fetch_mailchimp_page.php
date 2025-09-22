<?php
chdir(__DIR__ . '/../');
require __DIR__ . '/../vendor/autoload.php';
$app = require_once __DIR__ . '/../bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

$audienceId = $argv[1] ?? '4796e76b91';
$offset = isset($argv[2]) ? intval($argv[2]) : 0;
$apiKey = env('MAILCHIMP_API_KEY');
$server = env('MAILCHIMP_SERVER_PREFIX');
if (!$apiKey || !$server) { echo "Mailchimp creds missing\n"; exit(1); }

$logFile = __DIR__ . '/../storage/logs/mailchimp_page_test.log';
file_put_contents($logFile, "\n--- fetch page run: " . date('c') . " audience={$audienceId} offset={$offset} ---\n", FILE_APPEND);

$base = "https://{$server}.api.mailchimp.com/3.0";
$url = "$base/lists/{$audienceId}/members";

try {
    $res = Illuminate\Support\Facades\Http::withBasicAuth('anystring', $apiKey)->get($url, ['count' => 1000, 'offset' => $offset]);
    $status = $res->status();
    $body = $res->body();
    file_put_contents($logFile, "Status: {$status}\n", FILE_APPEND);
    file_put_contents($logFile, "Body length: " . strlen($body) . "\n", FILE_APPEND);
    file_put_contents($logFile, "Body snippet: " . substr($body, 0, 2000) . "\n", FILE_APPEND);
} catch (\Exception $e) {
    file_put_contents($logFile, "Exception: " . $e->getMessage() . "\n", FILE_APPEND);
}

echo "Wrote to: {$logFile}\n";
