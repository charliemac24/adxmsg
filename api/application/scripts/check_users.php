<?php

require __DIR__ . '/../vendor/autoload.php';

$app = require_once __DIR__ . '/../bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

use App\Models\User;

try {
    $count = User::count();
    echo "users_count=" . $count . PHP_EOL;
    $u = User::first();
    if ($u) {
        echo "first=" . $u->id . '|' . $u->name . '|' . $u->email . PHP_EOL;
    } else {
        echo "first=none" . PHP_EOL;
    }
} catch (\Exception $e) {
    echo "error=" . $e->getMessage() . PHP_EOL;
}
