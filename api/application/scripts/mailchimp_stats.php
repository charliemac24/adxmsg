<?php
chdir(__DIR__ . '/../');
require __DIR__ . '/../vendor/autoload.php';
$app = require_once __DIR__ . '/../bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

try {
    $rows = Illuminate\Support\Facades\DB::table('mailchimp_contacts')
        ->select('audience_id', Illuminate\Support\Facades\DB::raw('count(*) as cnt'))
        ->groupBy('audience_id')
        ->get();
    echo "Counts by audience_id:\n";
    foreach ($rows as $r) {
        echo " - {$r->audience_id}: {$r->cnt}\n";
    }
    $max = Illuminate\Support\Facades\DB::table('mailchimp_contacts')->max('id');
    echo "Max id: " . ($max ?? 'null') . "\n";
} catch (\Exception $e) {
    echo 'Exception: ' . $e->getMessage() . PHP_EOL;
}
