<?php
chdir(__DIR__ . '/../');
require __DIR__ . '/../vendor/autoload.php';
$app = require_once __DIR__ . '/../bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

try {
    $cnt = Illuminate\Support\Facades\DB::table('mailchimp_contacts')->count();
    echo "DB mailchimp_contacts count: " . $cnt . PHP_EOL;
} catch (\Exception $e) {
    echo 'Exception: ' . $e->getMessage() . PHP_EOL;
}
