<?php

namespace App\Jobs;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Foundation\Bus\Dispatchable;
use App\Models\Contacts;
use App\Models\UnsubscribeRedirect;
use Illuminate\Support\Str;
use Illuminate\Support\Facades\Config;

class GenerateUnsubscribeShortlinksJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public $timeout = 1200; // seconds

    public function __construct()
    {
        // no payload required; job will process existing contacts
    }

    public function handle()
    {
        $base = Config::get('app.url') ?: 'http://localhost';

        // Process contacts in chunks to avoid memory spikes
        Contacts::whereNotNull('unsubscribe_link')
            ->where('unsubscribe_link', 'not like', '%/u/%')
            ->orderBy('id')
            ->chunk(200, function ($contacts) use ($base) {
                foreach ($contacts as $c) {
                    $existing = $c->unsubscribe_link;
                    if (!$existing) continue;
                    // generate unique token
                    $token = Str::random(8);
                    while (UnsubscribeRedirect::where('token', $token)->exists()) {
                        $token = Str::random(8);
                    }

                    $redirect = UnsubscribeRedirect::create([
                        'contact_id' => $c->id,
                        'token' => $token,
                        'target_url' => $existing,
                    ]);

                    $short = rtrim($base, '/') . '/u/' . $token;
                    $c->unsubscribe_link = $short;
                    $c->save();
                }
            });
    }
}
