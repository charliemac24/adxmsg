<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\CampaignModel;
use Twilio\Rest\Client;
use App\Models\CampaignContactSent;

/**
 * Class CampaignController
 *
 * Handles creation, sending, and retrieval of SMS campaigns.
 */
class CampaignController extends Controller
{
    /**
     * Store a new campaign and optionally send immediately.
     *
     * @param  \Illuminate\Http\Request  $request
     * @return \Illuminate\Http\JsonResponse
     */
    public function store(Request $request)
    {
        $validated = $request->validate([
            'title' => 'required|string|max:255',
            'message' => 'required|string',
            'recipient_type' => 'required|in:person,group,state',
            'recipients' => 'required|array|min:1',
            'recipients.*' => 'integer',
            'scheduled_at' => [
                // Only required if immediate_send is not 1
                function ($attribute, $value, $fail) use ($request) {
                    if (empty($request->immediate_send) && empty($value)) {
                        $fail('The scheduled at field is required unless sending immediately.');
                    }
                    if (empty($request->immediate_send) && !empty($value)) {
                        if (!strtotime($value)) {
                            $fail('The scheduled at field must be a valid date.');
                        } elseif (strtotime($value) <= time()) {
                            $fail('The scheduled at field must be a future date.');
                        }
                    }
                }
            ],
            'immediate_send' => 'sometimes|boolean',
        ]);

        $status = 'Scheduled';
        $sentAt = null;
        $scheduledAt = $validated['scheduled_at'] ?? null;

        // If immediate_send is set and true, send campaign now
        if (!empty($validated['immediate_send']) && $validated['immediate_send']) {
            // Temporarily disabled sending from controller; worker/queue will handle actual send.
            // $this->sendCampaign($validated);
            $status = 'Sent';
            // mark as sent 5 minutes in the future to allow queued processing to start
            $sentAt = now()->addMinutes(5);
            $scheduledAt = now(); // Set scheduled_at to the actual sent time
        }

        $campaign = CampaignModel::create([
            'title' => $validated['title'],
            'message' => $validated['message'],
            'recipient_type' => $validated['recipient_type'],
            'recipients' => $validated['recipients'],
            'scheduled_at' => $scheduledAt,
            'status' => $status,
            'sent_at' => $sentAt,
            'created_by' => auth()->id() ?? null,
        ]);

        // Populate campaign_contact_sent rows for each target contact (processed defaults to 0)
        try {
            $recipientIds = is_array($campaign->recipients) ? $campaign->recipients : (json_decode($campaign->recipients, true) ?: []);
            $contactIds = [];

            if ($campaign->recipient_type === 'person') {
                // recipients are explicit contact ids
                $contactIds = array_map('intval', $recipientIds);
            } elseif ($campaign->recipient_type === 'group') {
                $contactIds = \App\Models\Contacts::whereIn('group_no', $recipientIds)->where('is_subscribed',1)->pluck('id')->map(fn($v)=>(int)$v)->toArray();
            } elseif ($campaign->recipient_type === 'state') {
                $contactIds = \App\Models\Contacts::whereIn('address_state', $recipientIds)->where('is_subscribed',1)->pluck('id')->map(fn($v)=>(int)$v)->toArray();
            }

            // Insert entries (skip duplicates)
            foreach (array_unique($contactIds) as $cid) {
                if (empty($cid)) continue;
                CampaignContactSent::firstOrCreate(
                    ['campaign_id' => $campaign->id, 'contact_id' => $cid],
                    ['processed' => 0]
                );
            }
        } catch (\Throwable $e) {
            \Log::error('Failed to populate campaign_contact_sent: '.$e->getMessage(), ['campaign_id'=>$campaign->id]);
        }
 
        return response()->json([
            'message' => $status === 'Sent' ? 'Campaign sent and saved successfully.' : 'Campaign created successfully.',
            'campaign' => $campaign
        ], 201);
    }

    /**
     * Store a new campaign in Draft status (does not send).
     *
     * @param  \Illuminate\Http\Request  $request
     * @return \Illuminate\Http\JsonResponse
     */
    public function storeDraft(Request $request)
    {
        $validated = $request->validate([
            'title' => 'required|string|max:255',
            'message' => 'required|string',
            'recipient_type' => 'required|in:person,group,state',
            'recipients' => 'required|array|min:1',
            'recipients.*' => 'integer',
            // scheduled_at and immediate_send are not required for drafts
            'scheduled_at' => [
                // Only required if immediate_send is not 1
                function ($attribute, $value, $fail) use ($request) {
                    if (empty($request->immediate_send) && empty($value)) {
                        $fail('The scheduled at field is required unless sending immediately.');
                    }
                    if (empty($request->immediate_send) && !empty($value)) {
                        if (!strtotime($value)) {
                            $fail('The scheduled at field must be a valid date.');
                        } elseif (strtotime($value) <= time()) {
                            $fail('The scheduled at field must be a future date.');
                        }
                    }
                }
            ],
            'immediate_send' => 'sometimes|boolean',
        ]);

        // Always save drafts with status = 'Draft' and do not send
        $campaign = CampaignModel::create([
            'title' => $validated['title'],
            'message' => $validated['message'],
            'recipient_type' => $validated['recipient_type'],
            'recipients' => $validated['recipients'],
            'scheduled_at' => $validated['scheduled_at'] ?? null,
            'status' => 'Draft',
            'sent_at' => null,
            'created_by' => auth()->id() ?? null,
        ]);

        return response()->json([
            'message' => 'Campaign saved as Draft.',
            'campaign' => $campaign
        ], 201);
    }

    /**
     * Retrieve all campaigns with recipient details for display.
     *
     * @return \Illuminate\Http\JsonResponse
     */
    public function index()
    {
        $campaigns = CampaignModel::orderBy('created_at', 'desc')->get();

        $campaigns = $campaigns->map(function ($campaign) {
            $recipientDetails = [];

            if ($campaign->recipient_type === 'person') {
                $contacts = \App\Models\Contacts::whereIn('id', $campaign->recipients)->get();
                $recipientDetails['names'] = $contacts->map(function($c) {
                    return $c->first_name . ' ' . $c->last_name;
                })->toArray();
                $recipientDetails['count'] = $contacts->count();
            } elseif ($campaign->recipient_type === 'group') {
                $groups = \App\Models\Groups::whereIn('id', $campaign->recipients)->get();
                $recipientDetails['names'] = $groups->pluck('group_name')->toArray();
                // Count all contacts in these groups
                $recipientDetails['count'] = \App\Models\Contacts::whereIn('group_no', $campaign->recipients)->count();
            } elseif ($campaign->recipient_type === 'state') {
                $states = \App\Models\AddressState::whereIn('id', $campaign->recipients)->get();
                $recipientDetails['names'] = $states->pluck('state')->toArray();
                // Count all contacts in these states
                $recipientDetails['count'] = \App\Models\Contacts::whereIn('address_state', $campaign->recipients)->count();
            }

            $campaign->recipient_details = $recipientDetails;
            return $campaign;
        });

        return response()->json($campaigns);
    }

    /**
     * Get the Twilio client and sender number from config.
     *
     * @return array [\Twilio\Rest\Client $twilio, string $from]
     */
    protected function getTwilioClientAndFrom()
    {
        $sid    = config('services.twilio.sid');
        $token  = config('services.twilio.token');
        $from   = config('services.twilio.from');
        $twilio = new Client($sid, $token);

        return [$twilio, $from];
    }

    /**
     * Send the campaign SMS to all recipients using Twilio.
     *
     * @param  array  $data
     * @return int Number of recipients the message was sent to
     */
    public function sendCampaign(array $data)
    {
        $campaignId = $data['campaign_id'] ?? null;
        $message = $data['message'];
        $recipientType = $data['recipient_type'];
        $recipientIds = $data['recipients'];

        // Collect contacts to send to (keep contact objects so we can append per-contact unsubscribe links)
        $contactsMap = [];

        // If a campaign_id was provided, only select contacts that are still unprocessed (processed = 0)
        if (!empty($campaignId)) {
            $pendingContactIds = CampaignContactSent::where('campaign_id', $campaignId)
                ->where('processed', 0)
                ->pluck('contact_id')
                ->toArray();

            if (empty($pendingContactIds)) {
                \Log::info('No unprocessed contacts for campaign', ['campaign_id' => $campaignId]);
                return 0;
            }

            // Respect subscription flag as well
            $contacts = \App\Models\Contacts::whereIn('id', $pendingContactIds)
                ->where('is_subscribed', 1)
                ->get();
        } else {
            // fallback to prior behaviour when no campaign_id supplied
            if ($recipientType === 'person') {
                $contacts = \App\Models\Contacts::whereIn('id', $recipientIds)
                    ->where('is_subscribed', 1)
                    ->get();
            } elseif ($recipientType === 'group') {
                $contacts = \App\Models\Contacts::whereIn('group_no', $recipientIds)
                    ->where('is_subscribed', 1)
                    ->get();
            } elseif ($recipientType === 'state') {
                $contacts = \App\Models\Contacts::whereIn('address_state', $recipientIds)
                    ->where('is_subscribed', 1)
                    ->get();
            } else {
                $contacts = collect();
            }
        }

        foreach ($contacts as $contact) {
            if (empty($contact->primary_no)) continue;
            // use phone number as key to dedupe; preserve the contact record for unsubscribe link
            $contactsMap[$contact->primary_no] = $contact;
        }

        // No recipients
        if (empty($contactsMap)) {
            \Log::info('Campaign had no subscribed recipients to send to', ['title' => $data['title'] ?? null]);
            return 0;
        }

        // Send SMS using Twilio; append each contact's unsubscribe link at the bottom of the message
        [$twilio, $from] = $this->getTwilioClientAndFrom();
        $sentCount = 0;
        $sentDetails = [];

        foreach ($contactsMap as $to => $contact) {
            // start from the saved campaign message
            $body = $message ?? '';

            // Remove any frontend-inserted unsubscribe text or placeholder that was added only for estimation.
            // - explicit fixed text like: "Opt out: adxmsg.com.au/s/u/1234" (or other numeric id)
            // - template placeholder like: {{unsubscribe_link}}
            $body = preg_replace('/\{\{\s*unsubscribe_link\s*\}\}/i', '', $body);
            $body = preg_replace('/\s*(?:—|-)?\s*Opt\s*out(?:\s*link)?\s*:\s*adxmsg\.com\.au\/s\/u\/\d+\s*/i', '', $body);
            $body = trim($body);

            if (!empty($contact->unsubscribe_link)) {
                // remove leading http:// or https:// so only the domain/path remains
                $link = trim($contact->unsubscribe_link);
                $link = preg_replace('#^https?://#i', '', $link);
                // Place opt-out on its own visual block but prefix with an em-dash
                $body .= "\n\nOpt out: " . $link;
            }

            try {
                $twilio->messages->create($to, [
                    'from' => $from,
                    'body' => $body,
                ]);
                $sentCount++;
                // record a small audit entry for debugging/ops (do not include sensitive data)
                $sentDetails[] = ['to' => $to, 'body_preview' => mb_substr($body, 0, 160)];
                // mark this contact as processed for this campaign (if campaign_id supplied)
                if (!empty($campaignId) && !empty($contact->id)) {
                    CampaignContactSent::where('campaign_id', $campaignId)
                        ->where('contact_id', $contact->id)
                        ->update([
                            'processed' => 1,
                            'date_processed' => now(),
                        ]);
                }
            } catch (\Exception $e) {
                \Log::error("Failed to send SMS to {$to}: " . $e->getMessage());
            }
        }

        \Log::info('Campaign SMS sent via Twilio', [
            'sent' => $sentCount,
            'title' => $data['title'] ?? null,
            'sample' => array_slice($sentDetails, 0, 5),
        ]);

        return $sentCount;
    }

    /**
     * Bulk delete campaigns. Accepts `campaign_id` parameter which can be a single
     * id or an array of ids.
     *
     * @param \Illuminate\Http\Request $request
     * @return \Illuminate\Http\JsonResponse
     */
    public function bulkDelete(Request $request)
    {
        $ids = $request->input('campaign_id');

        if (is_null($ids)) {
            return response()->json(['message' => 'No campaign_id provided.'], 400);
        }

        // Normalize to array
        if (!is_array($ids)) {
            $ids = [$ids];
        }

        // Cast to integers and filter invalid values
        $ids = array_values(array_filter(array_map(function ($v) {
            return is_numeric($v) ? (int) $v : null;
        }, $ids)));

        if (empty($ids)) {
            return response()->json(['message' => 'No valid campaign ids provided.'], 400);
        }

        try {
            $deleted = CampaignModel::whereIn('id', $ids)->delete();

            return response()->json([
                'message' => 'Campaign(s) deleted successfully.',
                'deleted' => $deleted,
            ]);
        } catch (\Exception $e) {
            \Log::error('Failed to delete campaigns: ' . $e->getMessage());
            return response()->json(['message' => 'Failed to delete campaigns.'], 500);
        }
    }

    /**
     * Update an existing campaign (only if it has not been sent yet).
     *
     * @param \Illuminate\Http\Request $request
     * @param int $id
     * @return \Illuminate\Http\JsonResponse
     */
    public function update(Request $request, $id)
    {
        $campaign = CampaignModel::find($id);
        if (!$campaign) {
            return response()->json(['message' => 'Campaign not found.'], 404);
        }

        // Do not allow editing campaigns that are already sent
        if ($campaign->status === 'Sent') {
            return response()->json(['message' => 'Cannot update a campaign that has already been sent.'], 400);
        }

        $validated = $request->validate([
            'title' => 'required|string|max:255',
            'message' => 'required|string',
            'recipient_type' => 'required|in:person,group,state',
            'recipients' => 'required|array|min:1',
            'recipients.*' => 'integer',
            'scheduled_at' => [
                function ($attribute, $value, $fail) use ($request) {
                    if (empty($request->immediate_send) && empty($value)) {
                        $fail('The scheduled at field is required unless sending immediately.');
                    }
                    if (empty($request->immediate_send) && !empty($value)) {
                        if (!strtotime($value)) {
                            $fail('The scheduled at field must be a valid date.');
                        } elseif (strtotime($value) <= time()) {
                            $fail('The scheduled at field must be a future date.');
                        }
                    }
                }
            ],
            'immediate_send' => 'sometimes|boolean',
        ]);

        $campaign->title = $validated['title'];
        $campaign->message = $validated['message'];
        $campaign->recipient_type = $validated['recipient_type'];
        $campaign->recipients = $validated['recipients'];

        // Handle immediate send
        if (!empty($validated['immediate_send']) && $validated['immediate_send']) {
            // send now using existing sendCampaign logic
            try {
                //$this->sendCampaign($validated);
                $campaign->status = 'Sent';
                $campaign->sent_at = now()->addMinutes(5);
                $campaign->scheduled_at = now();
            } catch (\Exception $e) {
                \Log::error('Failed to send campaign on update: ' . $e->getMessage());
                return response()->json(['message' => 'Failed to send campaign.'], 500);
            }
        } else {
            $campaign->status = 'Scheduled';
            $campaign->sent_at = null;
            $campaign->scheduled_at = $validated['scheduled_at'] ?? null;
        }

        $campaign->save();

        return response()->json(['message' => 'Campaign updated successfully.', 'campaign' => $campaign]);
    }
}
