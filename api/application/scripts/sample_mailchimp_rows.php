<?php
require __DIR__ . '/../vendor/autoload.php';
$app = require_once __DIR__ . '/../bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

use App\Models\MailchimpContact;

$rows = MailchimpContact::where('audience_id','4796e76b91')->orderBy('synced_at','desc')->take(10)->get(['id','email','phone','business_name','business_address','tags','synced_at'])->toArray();
echo json_encode($rows, JSON_PRETTY_PRINT);
