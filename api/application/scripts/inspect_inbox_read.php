<?php
// One-off diagnostic script. Run from application/ directory: php scripts/inspect_inbox_read.php
require __DIR__ . '/../bootstrap/app.php';

// Bootstrap the framework
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

use Illuminate\Support\Facades\DB;

echo "Counts by source_table for is_read=1:\n";
$rows = DB::table('inbox')->select(DB::raw("COALESCE(source_table, 'NULL') as src"), DB::raw('COUNT(*) as cnt'))
    ->where('is_read', true)
    ->groupBy('src')
    ->orderBy('cnt', 'desc')
    ->get();
foreach ($rows as $r) {
    echo sprintf("%s: %d\n", $r->src, $r->cnt);
}

echo "\nSample inbox rows where is_read=1 (limit 30):\n";
$samples = DB::table('inbox')->select('id','source_table','source_id','from_number','to_number','status','is_read','read_at','group_number','date_executed')
    ->where('is_read', true)
    ->orderBy('date_executed','desc')
    ->limit(30)
    ->get();
foreach ($samples as $s) {
    echo json_encode((array)$s) . "\n";
}

echo "\nCounts of inbox rows by status where is_read=1:\n";
$st = DB::table('inbox')->select('status', DB::raw('COUNT(*) as cnt'))
    ->where('is_read', true)
    ->groupBy('status')
    ->get();
foreach ($st as $x) echo sprintf("%s: %d\n", $x->status === null ? 'NULL' : $x->status, $x->cnt);

echo "\nDone.\n";
