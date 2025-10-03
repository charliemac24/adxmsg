<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use App\Models\CampaignModel;
use App\Http\Controllers\CampaignController;
use Carbon\Carbon;
use App\Models\CampaignContactSent;
use App\Models\Contacts;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\DB;

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
     * Simplified: Check for active campaigns and run one full cycle.
     *
     * @return int
     */
    public function handle()
    {
        $this->info('Checking for scheduled campaigns...');

        // Find campaigns that are scheduled, whose scheduled_at is in the past or now,
        // actual_sent is null/empty, and status is 'Scheduled'
        $now = Carbon::now();
        $campaign = CampaignModel::whereNotNull('scheduled_at')
            ->where('scheduled_at', '<=', $now)
            ->where(function($query) {
                $query->whereNull('actual_sent')
                      ->orWhere('actual_sent', '');
            })
            ->where('status', 'Scheduled')
            ->first();

        if (!$campaign) {
            $this->info('No scheduled campaigns to send.');
            return 0;
        }

        // Update actual_sent immediately to prevent this campaign from running again
        $campaign->actual_sent = $now;
        $campaign->status = 'Processing';
        $campaign->save();

        $this->info('Processing campaign id=' . $campaign->id . ' title=' . ($campaign->title ?? 'Untitled'));

        try {
            // Get all contacts for this campaign that haven't been processed
            $campaignContacts = CampaignContactSent::where('campaign_id', $campaign->id)
                ->where('processed', 0)
                ->get();

            $controller = new CampaignController();
            $processedCount = 0;

            foreach ($campaignContacts as $campaignContact) {
                // Mark this contact as processed
                $campaignContact->processed = 1;
                $campaignContact->date_processed = Carbon::now();
                $campaignContact->save();
                
                $processedCount++;
            }

            // Send the campaign
            $data = [
                'campaign_id' => $campaign->id,
                'title' => $campaign->title ?? 'Untitled',
                'message' => $campaign->message,
                'recipient_type' => $campaign->recipient_type,
                'recipients' => $campaign->recipients,
            ];

            $sentCount = $controller->sendCampaign($data);
            
            // Update campaign as completed
            $campaign->sent_count = ($campaign->sent_count ?? 0) + intval($sentCount);
            $campaign->status = 'Sent';
            $campaign->sent_at = Carbon::now();
            $campaign->save();

            $this->info("Campaign id={$campaign->id} completed. Processed {$processedCount} contacts, sent {$sentCount} messages.");

        } catch (\Exception $e) {
            Log::error('Failed to send scheduled campaign id=' . $campaign->id . ': ' . $e->getMessage(), [
                'campaign_id' => $campaign->id,
                'exception' => $e->getTraceAsString()
            ]);
            $this->error('Failed to send campaign id=' . $campaign->id . ': ' . $e->getMessage());
        }

        return 0;
    }
}
