<?php
// Run this from the project root: php application/scripts/generate_unsubscribe_shortlinks.php
use Illuminate\Support\Str;

require __DIR__ . '/../../vendor/autoload.php';
// Bootstrap the framework
$app = require_once __DIR__ . '/../../bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

use App\Models\Contacts;
use App\Models\UnsubscribeRedirect;
use Illuminate\Support\Facades\Config;

$base = Config::get('app.url') ?: 'http://localhost';

$contacts = Contacts::all();
$total = $contacts->count();
$created = 0;
foreach ($contacts as $c) {
    $existing = $c->unsubscribe_link;
    if (!$existing) continue;
    // skip if already points to our /u/ path
    if (strpos($existing, '/u/') !== false) continue;

    $token = Str::random(8);
    // ensure unique
    while (UnsubscribeRedirect::where('token', $token)->exists()) {
        $token = Str::random(8);
    }

    $target = $existing; // preserve the current unsubscribe link
    $redirect = UnsubscribeRedirect::create([
        'contact_id' => $c->id,
        'token' => $token,
        'target_url' => $target,
    ]);

    $short = rtrim($base, '/') . '/u/' . $token;
    $c->unsubscribe_link = $short;
    $c->save();
    $created++;
}

echo "Processed {$total} contacts. Created/updated {$created} short links.\n";
