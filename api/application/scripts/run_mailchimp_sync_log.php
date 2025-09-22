<?php
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

$logFile = __DIR__ . '/../storage/logs/mailchimp_sync_run.log';
file_put_contents($logFile, "\n--- Mailchimp sync run: " . date('c') . " audience={$audienceId} ---\n", FILE_APPEND);

$base = "https://{$server}.api.mailchimp.com/3.0";
$url = "$base/lists/{$audienceId}/members";
// use smaller pages and retries for robustness
$perPage = 500;
$totalSynced = 0;
$now = now();
$maxRetries = 3;

file_put_contents($logFile, "Fetching first page...\n", FILE_APPEND);
$first = Illuminate\Support\Facades\Http::withBasicAuth('anystring', $apiKey)->get($url, ['count' => $perPage, 'offset' => 0]);
if (!$first->ok()) { file_put_contents($logFile, "First page error: " . $first->body() . "\n", FILE_APPEND); exit(1); }
$fdata = $first->json();
$totalItems = isset($fdata['total_items']) ? intval($fdata['total_items']) : null;
$pages = $totalItems ? (int) ceil($totalItems / $perPage) : 1;
file_put_contents($logFile, "Total items: " . ($totalItems ?? 'unknown') . ", pages: " . $pages . "\n", FILE_APPEND);

$members = $fdata['members'] ?? [];
foreach ($members as $m) {
    App\Models\MailchimpContact::updateOrCreate(
        ['mailchimp_id' => $m['id'] ?? null, 'audience_id' => (string)$audienceId],
        ['email' => $m['email_address'] ?? null, 'first_name' => $m['merge_fields']['FNAME'] ?? null, 'last_name' => $m['merge_fields']['LNAME'] ?? null, 'phone' => $m['merge_fields']['PHONE'] ?? null, 'raw' => $m, 'synced_at' => $now]
    );
    $totalSynced++;
}
file_put_contents($logFile, "Page 1 synced: " . count($members) . "\n", FILE_APPEND);

for ($i = 1; $i < $pages; $i++) {
    $offset = $i * $perPage;
        file_put_contents($logFile, "Fetching page " . ($i+1) . " (offset {$offset})...\n", FILE_APPEND);
        $attempt = 0;
        $pageMembers = [];
        while ($attempt < $maxRetries) {
            $attempt++;
            file_put_contents($logFile, "Attempt {$attempt} for page " . ($i+1) . "\n", FILE_APPEND);
            try {
                $res = Illuminate\Support\Facades\Http::withBasicAuth('anystring', $apiKey)->get($url, ['count' => $perPage, 'offset' => $offset]);
                $status = $res->status();
                $body = $res->body();
                file_put_contents($logFile, "Page " . ($i+1) . " HTTP status: {$status}\n", FILE_APPEND);
                file_put_contents($logFile, "Body length: " . strlen($body) . "\n", FILE_APPEND);
                if (!$res->ok()) {
                    file_put_contents($logFile, "Page " . ($i+1) . " error (status {$status}): " . substr($body, 0, 800) . "\n", FILE_APPEND);
                    // retry after short backoff
                    sleep($attempt);
                    continue;
                }
                $data = $res->json();
                $pageMembers = $data['members'] ?? [];
                // success, break retry loop
                break;
            } catch (\Exception $e) {
                file_put_contents($logFile, "Exception on fetch attempt {$attempt} for page " . ($i+1) . ": " . $e->getMessage() . "\n", FILE_APPEND);
                sleep($attempt);
                continue;
            }
        }

        if (empty($pageMembers)) {
            file_put_contents($logFile, "No members returned for page " . ($i+1) . ", aborting.\n", FILE_APPEND);
            break;
        }

        foreach ($pageMembers as $m) {
            try {
                App\Models\MailchimpContact::updateOrCreate(
                    ['mailchimp_id' => $m['id'] ?? null, 'audience_id' => (string)$audienceId],
                    ['email' => $m['email_address'] ?? null, 'first_name' => $m['merge_fields']['FNAME'] ?? null, 'last_name' => $m['merge_fields']['LNAME'] ?? null, 'phone' => $m['merge_fields']['PHONE'] ?? null, 'raw' => $m, 'synced_at' => $now]
                );
                $totalSynced++;
            } catch (\Exception $e) {
                file_put_contents($logFile, "Error saving member: " . $e->getMessage() . "\n", FILE_APPEND);
            }
        }
        file_put_contents($logFile, "Page " . ($i+1) . " synced: " . count($pageMembers) . "\n", FILE_APPEND);
        usleep(150000);
}

file_put_contents($logFile, "Total synced: " . $totalSynced . "\n", FILE_APPEND);
echo "Wrote log to: " . $logFile . "\n";
