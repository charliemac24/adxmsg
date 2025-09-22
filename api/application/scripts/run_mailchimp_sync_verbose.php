<?php
// Verbose runner that pages Mailchimp and echoes progress as it writes to DB
chdir(__DIR__ . '/../');
require __DIR__ . '/../vendor/autoload.php';
$app = require_once __DIR__ . '/../bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

$audienceId = $argv[1] ?? '4796e76b91';
$apiKey = env('MAILCHIMP_API_KEY');
$server = env('MAILCHIMP_SERVER_PREFIX');
if (!$apiKey || !$server) {
    echo "Mailchimp credentials missing\n"; exit(1);
}

$base = "https://{$server}.api.mailchimp.com/3.0";
$url = "$base/lists/{$audienceId}/members";
$perPage = 1000;
$totalSynced = 0;
$now = now();

echo "Fetching first page...\n";
$first = Illuminate\Support\Facades\Http::withBasicAuth('anystring', $apiKey)->get($url, ['count' => $perPage, 'offset' => 0]);
if (!$first->ok()) { echo "First page error: " . $first->body() . "\n"; exit(1); }
$fdata = $first->json();
$totalItems = isset($fdata['total_items']) ? intval($fdata['total_items']) : null;
$pages = $totalItems ? (int) ceil($totalItems / $perPage) : 1;
echo "Total items: " . ($totalItems ?? 'unknown') . ", pages: " . $pages . "\n";

$members = $fdata['members'] ?? [];
foreach ($members as $m) {
    App\Models\MailchimpContact::updateOrCreate(
        ['mailchimp_id' => $m['id'] ?? null, 'audience_id' => (string)$audienceId],
        ['email' => $m['email_address'] ?? null, 'first_name' => $m['merge_fields']['FNAME'] ?? null, 'last_name' => $m['merge_fields']['LNAME'] ?? null, 'phone' => $m['merge_fields']['PHONE'] ?? null, 'raw' => $m, 'synced_at' => $now]
    );
    $totalSynced++;
}
echo "Page 1 synced: " . count($members) . "\n";

for ($i = 1; $i < $pages; $i++) {
    $offset = $i * $perPage;
    echo "Fetching page " . ($i+1) . " (offset {$offset})...\n";
    $res = Illuminate\Support\Facades\Http::withBasicAuth('anystring', $apiKey)->get($url, ['count' => $perPage, 'offset' => $offset]);
    if (!$res->ok()) { echo "Page " . ($i+1) . " error: " . $res->body() . "\n"; break; }
    $data = $res->json();
    $members = $data['members'] ?? [];
    foreach ($members as $m) {
        App\Models\MailchimpContact::updateOrCreate(
            ['mailchimp_id' => $m['id'] ?? null, 'audience_id' => (string)$audienceId],
            ['email' => $m['email_address'] ?? null, 'first_name' => $m['merge_fields']['FNAME'] ?? null, 'last_name' => $m['merge_fields']['LNAME'] ?? null, 'phone' => $m['merge_fields']['PHONE'] ?? null, 'raw' => $m, 'synced_at' => $now]
        );
        $totalSynced++;
    }
    echo "Page " . ($i+1) . " synced: " . count($members) . "\n";
    usleep(150000);
}

echo "Total synced: " . $totalSynced . "\n";
