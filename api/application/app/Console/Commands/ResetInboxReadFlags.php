<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use App\Models\Inbox;

class ResetInboxReadFlags extends Command
{
    /**
     * The name and signature of the console command.
     *
     * @var string
     */
    protected $signature = 'inbox:reset-unread {--dry-run} {--batch=1000}';

    /**
     * The console command description.
     *
     * @var string
     */
    protected $description = 'Reset is_read/status/read_at for migrated inbound rows that have no recorded view (safe, chunked)';

    public function handle()
    {
        $dry = $this->option('dry-run');
        $batch = (int) $this->option('batch') ?: 1000;

        $this->info('Scanning for migrated inbox rows with no recorded inbound view...');

        // Count how many would be affected
        $toReset = DB::table('inbox as i')
            ->leftJoin('inbound_message_views as v', function($j){
                $j->on('v.inbound_message_id', '=', 'i.source_id')->whereRaw("i.source_table = 'inbound_messages'");
            })
            ->where('i.is_read', true)
            ->whereNull('v.inbound_message_id')
            ->count();

        $this->info("Rows flagged read with no view: {$toReset}");

        if ($toReset === 0) {
            $this->info('Nothing to do.');
            return 0;
        }

        if ($dry) {
            $this->info('Dry-run mode; no changes made.');
            return 0;
        }

        $this->info('Resetting flags in chunks...');

        // Process in chunks by id to avoid locking huge tables
        $processed = 0;
        Inbox::where('is_read', true)
            ->where('source_table', 'inbound_messages')
            ->whereNotExists(function($q){
                $q->select(DB::raw(1))->from('inbound_message_views as v')->whereRaw('v.inbound_message_id = inbox.source_id');
            })
            ->orderBy('id')
            ->chunkById($batch, function($rows) use (&$processed) {
                foreach ($rows as $r) {
                    try {
                        $r->is_read = false;
                        $r->status = null;
                        $r->read_at = null;
                        $r->save();
                        $processed++;
                    } catch (\Exception $e) {
                        // continue on per-row failure
                    }
                }
            });

        $this->info("Completed. Rows updated: {$processed}");
        return 0;
    }
}
