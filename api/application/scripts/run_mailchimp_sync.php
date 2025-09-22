<?php
// One-off script to bootstrap the Laravel app and call MailchimpController::syncAudience
// Usage: php run_mailchimp_sync.php 1590941

chdir(__DIR__ . '/../');
require __DIR__ . '/../vendor/autoload.php';
$app = require_once __DIR__ . '/../bootstrap/app.php';

$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

$audienceId = $argv[1] ?? '1590941';

try {
    echo "Starting Mailchimp sync for audience: {$audienceId}\n";
    $controller = $app->make(\App\Http\Controllers\MailchimpController::class);
    $request = new Illuminate\Http\Request();
    $response = $controller->syncAudience($request, $audienceId);
    echo "Sync call completed.\n";
    if (is_object($response) && method_exists($response, 'getContent')) {
        echo $response->getContent() . PHP_EOL;
        if (method_exists($response, 'getStatusCode')) {
            echo 'HTTP status: ' . $response->getStatusCode() . PHP_EOL;
        }
    } else {
        var_export($response);
        echo PHP_EOL;
    }
} catch (\Exception $e) {
    echo 'Exception: ' . $e->getMessage() . PHP_EOL;
}
