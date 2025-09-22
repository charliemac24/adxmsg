<?php
// Usage: php dump_mailchimp_contacts.php
chdir(__DIR__ . '/../');
require __DIR__ . '/../vendor/autoload.php';
$app = require_once __DIR__ . '/../bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

try {
    $count = App\Models\MailchimpContact::count();
    echo "mailchimp_contacts rows: " . $count . PHP_EOL;
    $rows = App\Models\MailchimpContact::orderBy('id')->limit(5)->get(['id','mailchimp_id','email','first_name','last_name','audience_id','synced_at']);
    foreach ($rows as $r) {
        echo implode(' | ', [$r->id, $r->mailchimp_id, $r->email, $r->first_name, $r->last_name, $r->audience_id, $r->synced_at]) . PHP_EOL;
    }
} catch (\Exception $e) {
    echo 'Exception: ' . $e->getMessage() . PHP_EOL;
}
