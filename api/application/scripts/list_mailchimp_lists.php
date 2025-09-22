<?php
// Usage: php list_mailchimp_lists.php
chdir(__DIR__ . '/../');
require __DIR__ . '/../vendor/autoload.php';
$app = require_once __DIR__ . '/../bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

try {
    $apiKey = env('MAILCHIMP_API_KEY');
    $server = env('MAILCHIMP_SERVER_PREFIX');
    if (!$apiKey || !$server) {
        echo "Mailchimp credentials not set in .env\n";
        exit(1);
    }
    $base = "https://{$server}.api.mailchimp.com/3.0";
    $url = "$base/lists";
    $res = Illuminate\Support\Facades\Http::withBasicAuth('anystring', $apiKey)->get($url, ['count' => 1000]);
    echo $res->body() . PHP_EOL;
    echo 'HTTP status: ' . $res->status() . PHP_EOL;
} catch (\Exception $e) {
    echo 'Exception: ' . $e->getMessage() . PHP_EOL;
}
