<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use App\Models\InboundMessage;
use App\Models\OutboundMessage;
use App\Models\AutoResponseLog;
use App\Models\CampaignModel;
use App\Models\Inbox;
use Illuminate\Support\Facades\DB;

class MigrateToInbox extends Command
{
    /**
     * The name and signature of the console command.
     *
     * @var string
     */
    protected $signature = 'migrate:inbox {--batch=1000}';

    /**
     * The console command description.
     *
     * @var string
     */
    protected $description = 'Migrate inbound/outbound/auto-response/campaign data into unified inbox table';

    public function handle()
    {
        $batch = (int) $this->option('batch') ?: 1000;

        DB::beginTransaction();
        try {
            $this->info('Migrating InboundMessage...');
            InboundMessage::orderBy('id')->chunk($batch, function($rows) {
                $insert = [];
                foreach ($rows as $r) {
                    // skip if this source row has already been migrated
                    $exists = Inbox::where('source_table', 'inbound_messages')->where('source_id', $r->id)->exists();
                    if ($exists) continue;
                     $insert[] = [
                         'direction' => 'inbound',
                         'from_number' => $r->from_number,
                         'to_number' => null,
                         // group_number: prefer the other party (from_number for inbound), digits-only
                         'group_number' => !empty($r->from_number) ? preg_replace('/\D+/', '', $r->from_number) : (!empty($r->to_number) ? preg_replace('/\D+/', '', $r->to_number) : null),
                         'message_body' => $r->message_body,
                         'status' => 'received',//$r->status,
                         'is_read' => 0,
                         'twilio_sid' => $r->twilio_sid,
                         'conversation_id' => $r->conversation_id,
                         'date_executed' => $r->received_at ?? $r->created_at,
                         'created_at' => $r->created_at,
                         'updated_at' => $r->updated_at,
                         'source_table' => 'inbound_messages',
                         'source_id' => $r->id,
                     ];
                 }
                 if (!empty($insert)) Inbox::insert($insert);
             });

            $this->info('Migrating OutboundMessage...');
            if (class_exists('\App\\Models\\OutboundMessage')) {
                OutboundMessage::orderBy('id')->chunk($batch, function($rows) {
                    $insert = [];
                        foreach ($rows as $r) {
                        // skip if this source row has already been migrated
                        $exists = Inbox::where('source_table', 'outbound_messages')->where('source_id', $r->id)->exists();
                        if ($exists) continue;
                         $insert[] = [
                             'direction' => 'outbound',
                             'from_number' => null,
                             'to_number' => $r->to_number,
                             // group_number: prefer the other party (to_number for outbound), digits-only
                             'group_number' => !empty($r->to_number) ? preg_replace('/\D+/', '', $r->to_number) : (!empty($r->from_number) ? preg_replace('/\D+/', '', $r->from_number) : null),
                             'message_body' => $r->message_body,
                             'status' => 'received',//$r->status,
                             'is_read' => 0,
                             'twilio_sid' => $r->twilio_sid,
                             'conversation_id' => $r->conversation_id,
                             'date_executed' => $r->date_sent ?? $r->created_at,
                             'created_at' => $r->created_at,
                             'updated_at' => $r->updated_at,
                             'source_table' => 'outbound_messages',
                             'source_id' => $r->id,
                         ];
                     }
                     if (!empty($insert)) Inbox::insert($insert);
                 });
             }

            // Skipping AutoResponseLog and CampaignModel migration per request; only inbound and outbound will be migrated.

            // After inserting all rows, run linking pass to relate inbound -> outbound replies
            $this->info('Linking inbound replies to outbound messages...');
            // First map outbound inbox rows by conversation_id for fast matching
            $outByConv = Inbox::where('direction', 'outbound')->whereNotNull('conversation_id')->get()->groupBy('conversation_id');

            // For each inbound inbox row, try to find an outbound row with same conversation_id
            Inbox::where('direction', 'inbound')->orderBy('date_executed')->chunk($batch, function($inbounds) use ($outByConv) {
                foreach ($inbounds as $ib) {
                    $relatedId = null;
                    // try conversation_id
                    if (!empty($ib->conversation_id) && isset($outByConv[$ib->conversation_id])) {
                        // pick the latest outbound in that conversation up to the inbound's timestamp
                        $candidates = $outByConv[$ib->conversation_id];
                        $best = null;
                        foreach ($candidates as $c) {
                            if (empty($c->date_executed)) continue;
                            if ($c->date_executed <= $ib->date_executed) {
                                if ($best === null || $c->date_executed > $best->date_executed) $best = $c;
                            }
                        }
                        if ($best) $relatedId = $best->id;
                    }

                    // Fallback: match by phone + nearest earlier outbound
                    if (!$relatedId && !empty($ib->from_number)) {
                        $cand = Inbox::where('direction', 'outbound')
                            ->where(function($q) use ($ib) {
                                $q->where('to_number', $ib->from_number)
                                  ->orWhere('to_number', preg_replace('/\D+/', '', $ib->from_number))
                                  ->orWhere('to_number', '+' . $ib->from_number);
                            })
                            ->whereNotNull('date_executed')
                            ->where('date_executed', '<=', $ib->date_executed)
                            ->orderBy('date_executed', 'desc')
                            ->first();
                        if ($cand) $relatedId = $cand->id;
                    }

                    if ($relatedId) {
                        try { $ib->related_inbox_id = $relatedId; $ib->save(); } catch (\Exception $e) { /* ignore */ }
                    }
                }
            });

            DB::commit();
            $this->info('Migration completed successfully.');
        } catch (\Exception $e) {
            DB::rollBack();
            $this->error('Migration failed: ' . $e->getMessage());
            return 1;
        }

        return 0;
    }
}
