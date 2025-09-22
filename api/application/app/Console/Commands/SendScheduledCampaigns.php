<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use App\Models\CampaignModel;
use App\Http\Controllers\CampaignController;
use Carbon\Carbon;
use App\Models\CampaignContactSent;
use App\Models\Contacts;

class SendScheduledCampaigns extends Command
{
    /**
     * The name and signature of the console command.
     *
     * @var string
     */
    protected $signature = 'campaigns:send-scheduled';

    /**
     * The console command description.
     *
     * @var string
     */
    protected $description = 'Send scheduled campaigns whose scheduled_at <= now and status is Scheduled';

    /**
     * Execute the console command.
     *
     * @return int
     */
    public function handle()
    {
        $this->info('Checking for scheduled campaigns...');

        // Find campaigns that are scheduled, whose scheduled_at is in the past or now,
        // and that have not yet been actually sent (actual_sent is null).
        $now = Carbon::now();
        $campaigns = CampaignModel::whereNotNull('scheduled_at')
            ->where('scheduled_at', '<=', $now)
            ->whereNull('actual_sent')
            ->get();

        if ($campaigns->isEmpty()) {
            $this->info('No scheduled campaigns to send.');
            return 0;
        }

        $controller = new CampaignController();

        foreach ($campaigns as $campaign) {
            // Defensive check in case actual_sent was set by another process after the query
            if ($campaign->actual_sent !== null) {
                $this->info("Skipping campaign id={$campaign->id} because actual_sent is already set.");
                continue;
            }

            try {
                $this->info('Sending campaign id=' . $campaign->id . ' title=' . $campaign->title);

                // Mark campaign_contact_sent entries for contacts that have no usable phone number
                // so they don't block campaign completion.
                $pendingContactIds = CampaignContactSent::where('campaign_id', $campaign->id)
                    ->where('processed', 0)
                    ->pluck('contact_id')
                    ->toArray();

                if (!empty($pendingContactIds)) {
                    $noNumberIds = Contacts::whereIn('id', $pendingContactIds)
                        ->where(function ($q) {
                            $q->whereNull('primary_no')->orWhere('primary_no', '');
                        })
                        ->pluck('id')
                        ->toArray();

                    if (!empty($noNumberIds)) {
                        CampaignContactSent::where('campaign_id', $campaign->id)
                            ->whereIn('contact_id', $noNumberIds)
                            ->update([
                                'processed' => 1,
                                'date_processed' => Carbon::now(),
                            ]);
                        $this->info('Marked ' . count($noNumberIds) . ' contacts without phone as processed for campaign id=' . $campaign->id);
                    }
                }

                // Count how many contacts are still pending for this campaign before sending
                $pendingBefore = CampaignContactSent::where('campaign_id', $campaign->id)
                    ->where('processed', 0)
                    ->count();

                $data = [
                    'campaign_id' => $campaign->id,
                    'title' => $campaign->title,
                    'message' => $campaign->message,
                    'recipient_type' => $campaign->recipient_type,
                    'recipients' => $campaign->recipients,
                ];

                $sentCount = $controller->sendCampaign($data);

                // Accumulate sent_count
                $campaign->sent_count = ($campaign->sent_count ?? 0) + intval($sentCount);

                // How many remain unprocessed after this run?
                $remaining = CampaignContactSent::where('campaign_id', $campaign->id)
                    ->where('processed', 0)
                    ->count();

                if ($remaining === 0) {
                    // All done — mark as sent and record timestamps
                    $campaign->status = 'Sent';
                    $campaign->sent_at = Carbon::now();
                    $campaign->actual_sent = Carbon::now();
                    $this->info("Campaign id={$campaign->id} completed. sent_count={$campaign->sent_count}");
                } else {
                    // Partial progress — leave actual_sent null so cron will pick it up again
                    $campaign->status = 'Processing';
                    $this->info("Campaign id={$campaign->id} partially processed: {$sentCount} sent, {$remaining} remaining (was {$pendingBefore}).");
                }
                $campaign->save();
                $this->info("Campaign id={$campaign->id} processed in this run: {$sentCount} recipient(s).");
             } catch (\Exception $e) {
                 \Log::error('Failed to send scheduled campaign id=' . $campaign->id . ': ' . $e->getMessage());
                 $this->error('Failed to send campaign id=' . $campaign->id);
             }
        }

        return 0;
    }
}
