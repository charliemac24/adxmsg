<?php
// Usage: php count_mailchimp_contacts.php
chdir(__DIR__ . '/../');
require __DIR__ . '/../vendor/autoload.php';
$app = require_once __DIR__ . '/../bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

try {
    $count = App\Models\MailchimpContact::count();
    echo "mailchimp_contacts rows: " . $count . PHP_EOL;
} catch (\Exception $e) {
    echo 'Exception: ' . $e->getMessage() . PHP_EOL;
}
