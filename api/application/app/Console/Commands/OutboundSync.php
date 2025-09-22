<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Http\Request;

class OutboundSync extends Command
{
    /**
     * The name and signature of the console command.
     *
     * @var string
     */
    protected $signature = 'outbound:sync {--limit=50}';

    /**
     * The console command description.
     *
     * @var string
     */
    protected $description = 'Sync recent outbound messages from Twilio into the local database.';

    public function handle()
    {
        $limit = (int) $this->option('limit');
        if ($limit <= 0) $limit = 50;

        $this->info("Running outbound sync (limit={$limit})...");

        try {
            $controller = app()->make(\App\Http\Controllers\OutboundMessageController::class);
            $request = new Request(['limit' => $limit]);
            $response = $controller->syncOutboundFromTwilio($request);
            if (method_exists($response, 'getContent')) {
                $this->line($response->getContent());
            } else {
                $this->info('Outbound sync completed.');
            }
            return 0;
        } catch (\Exception $e) {
            $this->error('Failed to run outbound sync: ' . $e->getMessage());
            return 1;
        }
    }
}
