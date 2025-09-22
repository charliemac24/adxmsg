<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\Artisan;

class InboundSync extends Command
{
    /**
     * The name and signature of the console command.
     *
     * @var string
     */
    protected $signature = 'inbound:sync {--limit=50}';

    /**
     * The console command description.
     *
     * @var string
     */
    protected $description = 'Sync recent inbound messages from Twilio into the local database.';

    public function handle()
    {
        $limit = (int) $this->option('limit');
        if ($limit <= 0) $limit = 50;

        $this->info("Running inbound sync (limit={$limit})...");

        try {
            $controller = app()->make(\App\Http\Controllers\InboundMessageController::class);
            $request = new Request(['limit' => $limit]);
            $response = $controller->syncFromTwilio($request);
            // If controller returned a JsonResponse, get data
            if (method_exists($response, 'getContent')) {
                $content = $response->getContent();
                $this->line($content);
            } else {
                $this->info('Sync completed.');
            }
            return 0;
        } catch (\Exception $e) {
            $this->error('Failed to run inbound sync: ' . $e->getMessage());
            return 1;
        }
    }
}
