<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\InboundMessage;
use App\Models\AutoResponseLog;
use App\Models\Inbox;
use Twilio\Rest\Client;
use Illuminate\Support\Facades\Log;
use App\Models\InboundMessageView;
use Illuminate\Support\Facades\DB;

/**
 * Class InboundMessageController
 *
 * Handles inbound messages and sends auto-responses for orders.
 *
 * @package App\Http\Controllers
 */
class InboundMessageController extends Controller
{
    /**
     * Handle inbound SMS from Twilio and send auto-response if it's an order.
     * This method is intended for use as the auto-response webhook in Twilio.
     *
     * @param \Illuminate\Http\Request $request
     * @return \Illuminate\Http\Response
     */
    public function autoResponseWebhook(Request $request)
    {
        // Twilio sends 'From', 'Body', and 'MessageSid' in the webhook
        $fromNumber = $request->input('From');
        $messageBody = $request->input('Body');
        $twilioSid = $request->input('MessageSid');

        // Prefer any Twilio-provided timestamps (dateSent or dateCreated) if present
        $receivedAt = null;
        $dateKeys = ['DateSent', 'dateSent', 'date_sent', 'DateCreated', 'dateCreated', 'date_created'];
        foreach ($dateKeys as $k) {
            $raw = $request->input($k);
            if ($raw) {
                try {
                    if ($raw instanceof \DateTimeInterface) {
                        $carbon = \Carbon\Carbon::instance($raw);
                    } else {
                        $carbon = new \Carbon\Carbon($raw);
                    }
                    $carbon->setTimezone('UTC');
                    $receivedAt = $carbon->toDateTimeString();
                    break;
                } catch (\Exception $e) {
                    $receivedAt = null;
                }
            }
        }

        // If the webhook did not include timestamps, attempt to fetch the message from Twilio by SID
        if (empty($receivedAt) && !empty($twilioSid)) {
            try {
                list($twilio, $from) = $this->getTwilioClientAndFrom();
                $remote = $twilio->messages($twilioSid)->fetch();
                if (property_exists($remote, 'dateSent') && $remote->dateSent) {
                    $dt = $remote->dateSent;
                    if ($dt instanceof \DateTimeInterface) {
                        $carbon = \Carbon\Carbon::instance($dt);
                    } else {
                        $carbon = new \Carbon\Carbon($dt);
                    }
                    $carbon->setTimezone('UTC');
                    $receivedAt = $carbon->toDateTimeString();
                } elseif (property_exists($remote, 'dateCreated') && $remote->dateCreated) {
                    $dt = $remote->dateCreated;
                    if ($dt instanceof \DateTimeInterface) {
                        $carbon = \Carbon\Carbon::instance($dt);
                    } else {
                        $carbon = new \Carbon\Carbon($dt);
                    }
                    $carbon->setTimezone('UTC');
                    $receivedAt = $carbon->toDateTimeString();
                }
            } catch (\Exception $e) {
                // ignore: fall back to now() below
            }
        }

        // Fallback to now if nothing else found
        if (empty($receivedAt)) {
            $receivedAt = now()->toDateTimeString();
        }

        // Save inbound message
        $inbound = InboundMessage::create([
            'from_number'  => $fromNumber,
            'message_body' => $messageBody,
            'status'       => 'received',
            'received_at'  => $receivedAt,
            'twilio_sid'   => $twilioSid,
        ]);

        // Check if the message is likely an order
        if ($this->isOrderMessage($messageBody)) {
            $autoResponse = "Thanks for your order! Please ensure you have included:\n"
                . "*Name & Company \n"
                . "*Pickup/Delivery\n"
                . "*Order #\n"
                . "*Site contact\n"
                . "*Delivery address\n"
                . "*Date & Time required";

            list($twilio, $from) = $this->getTwilioClientAndFrom();

            $status = 'sent';
            $responseSid = null;
            $error = null;

            try {
                $response = $twilio->messages->create(
                    $fromNumber,
                    [
                        'from' => $from,
                        'body' => $autoResponse,
                    ]
                );
                $status = $response->status ?? 'sent';
                $responseSid = $response->sid ?? null;
            } catch (\Exception $e) {
                $status = 'failed';
                $error = $e->getMessage();
            }

            // Log the auto-response
            AutoResponseLog::create([
                'inbound_id'    => $inbound->id,
                'to_number'     => $fromNumber,
                'message_body'  => $autoResponse,
                'status'        => $status,
                'twilio_sid'    => $responseSid,
                'error_message' => $error,
                'created_at'    => now(),
            ]);
        }

        // Twilio expects a 200 OK with no content for webhook
        return response('', 200);
    }

    /**
     * Sync recent inbound messages from Twilio into the local database.
     *
     * Optional query params:
     * - limit: number of messages to fetch (default 50)
     *
     * @param \Illuminate\Http\Request $request
     * @return \Illuminate\Http\JsonResponse
     */
    public function syncFromTwilio(Request $request)
    {
        list($twilio, $from) = $this->getTwilioClientAndFrom();

        $limit = (int) $request->query('limit', 50);
        if ($limit <= 0) {
            $limit = 50;
        }

        try {
            // Read messages sent to our Twilio number (the recent ones)
            $messages = $twilio->messages->read(['to' => $from], $limit);
        } catch (\Exception $e) {
            return response()->json(['error' => 'Failed to fetch messages from Twilio', 'detail' => $e->getMessage()], 500);
        }

        $imported = 0;
        $checked = 0;
        $errors = [];

        // load tombstoned twilio sids to avoid re-importing deleted items
        $tombstoned = DB::table('deleted_inbound_twilio_sids')->pluck('twilio_sid')->filter()->values()->all();

        foreach ($messages as $m) {
            // debug lines removed
            // skip messages that are tombstoned
            if (!empty($m->sid) && in_array($m->sid, $tombstoned, true)) {
                continue;
            }
            $checked++;

            // Only process inbound messages
            $direction = property_exists($m, 'direction') ? $m->direction : null;
            if ($direction && strtolower($direction) !== 'inbound') {
                continue;
            }

            $receivedAt = null;
            // Prefer Twilio's dateSent or dateCreated when available and store as ISO timestamp.
            // Prefer Twilio-provided timestamps: dateSent -> dateCreated -> dateUpdated
            $receivedAt = null;
            $raw = $this->normalizeTwilioDate($m->dateSent ?? null);
            if (empty($raw)) {
                $raw = $this->normalizeTwilioDate($m->dateCreated ?? null);
            }
            if (empty($raw)) {
                $raw = $this->normalizeTwilioDate($m->dateUpdated ?? null);
            }
            if (!empty($raw)) {
                try {
                    $dt = new \Carbon\Carbon($raw);
                    $dt->setTimezone('UTC');
                    $receivedAt = $dt->toDateTimeString();
                } catch (\Exception $e) {
                    $receivedAt = null;
                }
            } else {
                $receivedAt = null; // leave null to avoid clobbering local timestamps
            }
            
            try {
                // Upsert (update existing by twilio_sid or create new)
                $conversationId = $m->sid ?? null;
                if (empty($conversationId)) {
                    $conversationId = null; // will be backfilled locally
                }

                // Only set received_at if Twilio provided one; avoid clobbering
                // local timestamps when re-running sync. Also persist twilio_sid to allow
                // future syncs to locate the same record and avoid duplicates.
                $twilioSidKey = $m->sid ?? null;
                $data = [
                    'from_number'  => $m->from ?? null,
                    'message_body' => $m->body ?? null,
                    'status'       => $m->status ?? 'received',
                    'conversation_id' => $conversationId,
                    'twilio_sid'   => $twilioSidKey,
                ];
                if (!empty($receivedAt)) {
                    $data['received_at'] = $receivedAt;
                }
                // Prefer not to clobber an existing local status (e.g. 'read') when re-syncing.
                // Use conversation_id as the primary key for matching existing conversations.
                // Fall back to twilio_sid if conversation_id is not present.
                $record = null;
                if (!empty($conversationId)) {
                    $existing = InboundMessage::where('conversation_id', $conversationId)->first();
                } elseif (!empty($twilioSidKey)) {
                    $existing = InboundMessage::where('twilio_sid', $twilioSidKey)->first();
                } else {
                    $existing = null;
                }

                if ($existing) {
                    // update fields except status to avoid overwriting user/server state
                    $updateData = [
                        'from_number' => $m->from ?? null,
                        'message_body' => $m->body ?? null,
                        'conversation_id' => $conversationId,
                    ];
                    if (!empty($receivedAt)) {
                        $updateData['received_at'] = $receivedAt;
                    } elseif (empty($existing->received_at)) {
                        // If there's no timestamp anywhere, set received_at to now so UI has a value
                        $updateData['received_at'] = now()->toIso8601String();
                    }
                    $existing->fill($updateData);
                    // ensure twilio_sid is stored on the record if missing
                    if (empty($existing->twilio_sid) && !empty($twilioSidKey)) {
                        $existing->twilio_sid = $twilioSidKey;
                    }
                    $existing->save();
                    $record = $existing;
                } else {
                    // create new record — set status from Twilio if provided, otherwise default to 'received'
                    $createData = $data; // includes twilio_sid and status => $m->status ?? 'received'
                    // If Twilio did not provide a timestamp, set received_at to now so the record isn't blank
                    if (empty($createData['received_at'])) {
                        $createData['received_at'] = now()->toIso8601String();
                    }
                    $record = InboundMessage::create($createData);
                }

                // Count only newly created records as 'imported'
                if (isset($record->wasRecentlyCreated) && $record->wasRecentlyCreated) {
                    $imported++;
                }
            } catch (\Exception $e) {
                $msg = "Failed to import Twilio message (sid=" . ($m->sid ?? 'unknown') . "): " . $e->getMessage();
                // Log to Laravel log for investigation
                Log::error($msg, ['twilio_message' => (array) $m]);
                $errors[] = ['sid' => $m->sid ?? null, 'error' => $e->getMessage()];
                continue;
            }
        }

        return response()->json([
            'checked' => $checked,
            'imported' => $imported,
            'errors' => $errors,
        ]);
    }

    /**
     * Return stored inbound messages.
     * Supports server-side pagination via query params: page, per_page
     *
     * @return \Illuminate\Http\JsonResponse
     */
    public function index()
    {
        $page = (int) request()->query('page', 1);
        $perPage = (int) request()->query('per_page', 25);
        if ($page < 1) $page = 1;
        if ($perPage < 1) $perPage = 25;

        // sorting: allow only certain columns for safety
        $allowedSort = ['received_at', 'id', 'created_at', 'from_number', 'status'];
        $sortBy = request()->query('sort_by', 'received_at');
        $sortDir = strtolower(request()->query('sort_dir', 'desc')) === 'asc' ? 'asc' : 'desc';
        if (!in_array($sortBy, $allowedSort)) {
            $sortBy = 'received_at';
        }

        $query = InboundMessage::orderBy($sortBy, $sortDir);

        // Optional: filter recent messages by last N days. Use ?days=30 to get last 30 days.
        $days = (int) request()->query('days', 0);
        if ($days > 0) {
            $fromDate = (new \Carbon\Carbon())->subDays(max(1, $days - 1))->startOfDay()->toDateTimeString();
            $query->where('received_at', '>=', $fromDate);
        }

        // filter by explicit phone query params for client-side fallbacks
        $fromNumberFilter = trim((string) request()->query('from_number', ''));
        $numberFilter = trim((string) request()->query('number', ''));
        if ($fromNumberFilter !== '') {
            $query->where('from_number', $fromNumberFilter);
        }
        if ($numberFilter !== '') {
            // inbound_messages table stores the sender in from_number — match that.
            // (to_number is not present on inbound_messages in this schema)
            $query->where('from_number', $numberFilter);
        }

        // search/filter by message text (generic q)
        $q = trim((string) request()->query('q', ''));
        if ($q !== '') {
            $query->where(function ($sub) use ($q) {
                $sub->where('from_number', 'like', '%' . $q . '%')
                    ->orWhere('message_body', 'like', '%' . $q . '%');
            });
        }
        $paginator = $query->paginate($perPage, ['*'], 'page', $page);

        // Normalize timezone and include ISO timestamp for client-side formatting
        $appTz = config('app.timezone') ?: date_default_timezone_get();
        $items = array_map(function ($item) use ($appTz) {
            // If item is an Eloquent model, use toArray() to get attributes correctly.
            if (is_object($item) && method_exists($item, 'toArray')) {
                $m = $item->toArray();
            } elseif (is_array($item)) {
                $m = $item;
            } else {
                $m = (array) $item;
            }

            // Normalize received_at into app timezone and provide ISO + formatted
            if (!empty($m['received_at'])) {
                try {
                    $dt = new \Carbon\Carbon($m['received_at']);
                    $dt->setTimezone($appTz);
                    $receivedAtIso = $dt->toIso8601String();
                    $receivedAtFormatted = $dt->format('Y-m-d H:i:s P');
                } catch (\Exception $e) {
                    $receivedAtIso = null;
                    $receivedAtFormatted = $m['received_at'];
                }
            } else {
                $receivedAtIso = null;
                $receivedAtFormatted = null;
            }

            $m['received_at_iso'] = $receivedAtIso;
            $m['received_at'] = $receivedAtFormatted;

            // Do not return created_at to clients here; we'll expose a merged
            // date_executed on the latest_message instead. Keep local created_at
            // only server-side and remove from the returned payload to avoid
            // clients relying on it.
            if (isset($m['created_at'])) {
                unset($m['created_at']);
            }

            return $m;
        }, $paginator->items());

        // Compute latest message (inbound or outbound) per phone present on this page.
        // Collect phones from the inbound items (inbound_messages store sender in from_number)
        $phones = array_values(array_unique(array_filter(array_map(function ($i) {
            return isset($i['from_number']) ? $i['from_number'] : null;
        }, $items))));

        $latestOutboundMap = [];
        // Batch-fetch latest outbound per phone (to_number) if outbound model exists
        if (!empty($phones) && class_exists('\App\\Models\\OutboundMessage')) {
            try {
                // For each phone, fetch the latest outbound message (try several normalized variants)
                // and compute a canonical epoch timestamp (UTC) for robust comparisons.
                foreach ($phones as $ph) {
                    try {
                        // Attempt to find the latest inbound row for this phone so we can
                        // also search by conversation_id or inbound_id. This helps catch
                        // replies that are linked by conversation rather than exact
                        // phone formatting variations.
                        $latestInboundForPhone = null;
                        try {
                            $latestInboundForPhone = \App\Models\InboundMessage::where('from_number', $ph)->orderBy('created_at', 'desc')->first();
                        } catch (\Exception $e) {
                            $latestInboundForPhone = null;
                        }
                        $convIdForPhone = null;
                        $inboundIdForPhone = null;
                        if ($latestInboundForPhone) {
                            $convIdForPhone = $latestInboundForPhone->conversation_id ?: $latestInboundForPhone->twilio_sid ?: null;
                            $inboundIdForPhone = $latestInboundForPhone->id ?? null;
                        }
                        $raw = trim((string) $ph);
                        $candidates = [$raw];

                        // If raw looks like digits only, also try with a leading +
                        if (preg_match('/^[0-9]+$/', $raw)) {
                            $candidates[] = '+' . $raw;
                        } else {
                            // If raw contains non-digits, add a digits-only variant and +variant
                            $digits = preg_replace('/\D+/', '', $raw);
                            if (!empty($digits)) {
                                $candidates[] = $digits;
                                $candidates[] = '+' . $digits;
                            }
                            // If it doesn't start with +, also try adding +prefix
                            if (strlen($raw) > 0 && $raw[0] !== '+') {
                                $candidates[] = '+' . $raw;
                            }
                        }

                        // unique and non-empty
                        $candidates = array_values(array_unique(array_filter($candidates, function ($v) { return $v !== null && $v !== ''; })));

                        $o = \App\Models\OutboundMessage::whereIn('to_number', $candidates)->orderBy('created_at', 'desc')->first();

                        // Also consider AutoResponseLog entries (auto-responses) as outbound-like messages
                        $a = null;
                        try {
                            // Prefer matching by inbound_id (conversation linkage) when available,
                            // otherwise fall back to to_number variants.
                            if (!empty($inboundIdForPhone)) {
                                $a = \App\Models\AutoResponseLog::where('inbound_id', $inboundIdForPhone)->orderBy('created_at', 'desc')->first();
                            }
                            if (!$a) {
                                $a = \App\Models\AutoResponseLog::whereIn('to_number', $candidates)->orderBy('created_at', 'desc')->first();
                            }
                        } catch (\Exception $e) {
                            $a = null;
                        }

                        // Also consider CampaignModel sent messages that include this phone as recipients
                        $cpm = null;
                        if (class_exists('\App\Models\CampaignModel')) {
                            try {
                                $cq = \App\Models\CampaignModel::where('status', 'sent');
                                $cq = $cq->where(function($q) use ($candidates) {
                                    foreach ($candidates as $cand) {
                                        // recipients is cast to array; match any candidate variant
                                        $q->orWhereJsonContains('recipients', $cand);
                                    }
                                });
                                $cpm = $cq->orderBy('sent_at', 'desc')->first();
                            } catch (\Exception $e) {
                                $cpm = null;
                            }
                        }

                        // Also consider outbound messages linked by conversation_id when available
                        $obByConv = null;
                        if (!empty($convIdForPhone)) {
                            try { $obByConv = \App\Models\OutboundMessage::where('conversation_id', $convIdForPhone)->orderBy('created_at', 'desc')->first(); } catch (\Exception $e) { $obByConv = null; }
                        }

                        // Normalize both candidates into arrays with a numeric UTC ts when possible
                        $best = null;

                        if ($obByConv) {
                            $oba = $obByConv->toArray();
                            $obts = null;
                            if (!empty($oba['date_sent'])) {
                                try { $c0 = new \Carbon\Carbon($oba['date_sent']); $c0->setTimezone('UTC'); $obts = $c0->getTimestamp(); } catch (\Exception $e) { $obts = null; }
                            }
                            if (empty($obts) && !empty($oba['created_at'])) {
                                try { $c02 = new \Carbon\Carbon($oba['created_at']); $c02->setTimezone('UTC'); $obts = $c02->getTimestamp(); } catch (\Exception $e) { $obts = null; }
                            }
                            if (!empty($obts)) {
                                $oba['date_exec_ts'] = $obts;
                                try { $iso = \Carbon\Carbon::createFromTimestamp($obts, 'UTC')->toIso8601String(); $fmt = \Carbon\Carbon::createFromTimestamp($obts, 'UTC')->format('Y-m-d H:i:s P'); } catch (\Exception $e) { $iso = null; $fmt = null; }
                                $oba['date_exec_iso'] = $iso;
                                // expose names frontend expects
                                if (!empty($iso)) { $oba['date_executed_iso'] = $iso; }
                                if (!empty($fmt)) { $oba['date_executed'] = $fmt; }
                            }
                            $best = $oba;
                        }

                        if ($o) {
                            $oa = $o->toArray();
                            $ots = null;
                            if (!empty($oa['date_sent'])) {
                                try { $c = new \Carbon\Carbon($oa['date_sent']); $c->setTimezone('UTC'); $ots = $c->getTimestamp(); } catch (\Exception $e) { $ots = null; }
                            }
                            if (empty($ots) && !empty($oa['created_at'])) {
                                try { $c2 = new \Carbon\Carbon($oa['created_at']); $c2->setTimezone('UTC'); $ots = $c2->getTimestamp(); } catch (\Exception $e) { $ots = null; }
                            }
                            if (!empty($ots)) {
                                $oa['date_exec_ts'] = $ots;
                                try { $iso2 = \Carbon\Carbon::createFromTimestamp($ots, 'UTC')->toIso8601String(); $fmt2 = \Carbon\Carbon::createFromTimestamp($ots, 'UTC')->format('Y-m-d H:i:s P'); } catch (\Exception $e) { $iso2 = null; $fmt2 = null; }
                                $oa['date_exec_iso'] = $iso2;
                                if (!empty($iso2)) { $oa['date_executed_iso'] = $iso2; }
                                if (!empty($fmt2)) { $oa['date_executed'] = $fmt2; }
                            }
                            if ($best && !empty($best['date_exec_ts']) && !empty($oa['date_exec_ts'])) {
                                if ((int)$oa['date_exec_ts'] > (int)$best['date_exec_ts']) {
                                    $best = $oa;
                                }
                            } elseif (!$best) {
                                $best = $oa;
                            }
                        }

                        if ($a) {
                            $aa = $a->toArray();
                            $ats = null;
                            if (!empty($aa['created_at'])) {
                                try { $c3 = new \Carbon\Carbon($aa['created_at']); $c3->setTimezone('UTC'); $ats = $c3->getTimestamp(); } catch (\Exception $e) { $ats = null; }
                            }
                            if (!empty($ats)) {
                                $aa['date_exec_ts'] = $ats;
                                try { $iso3 = \Carbon\Carbon::createFromTimestamp($ats, 'UTC')->toIso8601String(); $fmt3 = \Carbon\Carbon::createFromTimestamp($ats, 'UTC')->format('Y-m-d H:i:s P'); } catch (\Exception $e) { $iso3 = null; $fmt3 = null; }
                                $aa['date_exec_iso'] = $iso3;
                                if (!empty($iso3)) { $aa['date_executed_iso'] = $iso3; }
                                if (!empty($fmt3)) { $aa['date_executed'] = $fmt3; }
                            }

                            // If we already have an OutboundMessage candidate, pick the newer by timestamp
                            if ($best && !empty($best['date_exec_ts']) && !empty($aa['date_exec_ts'])) {
                                if ((int)$aa['date_exec_ts'] > (int)$best['date_exec_ts']) {
                                    $best = $aa;
                                }
                            } elseif (!$best) {
                                $best = $aa;
                            }
                        }

                        if ($cpm) {
                            $cpa = $cpm->toArray();
                            $cpts = null;
                            if (!empty($cpa['sent_at'])) {
                                try { $c0 = new \Carbon\Carbon($cpa['sent_at']); $c0->setTimezone('UTC'); $cpts = $c0->getTimestamp(); } catch (\Exception $e) { $cpts = null; }
                            }
                            if (empty($cpts) && !empty($cpa['created_at'])) {
                                try { $c02 = new \Carbon\Carbon($cpa['created_at']); $c02->setTimezone('UTC'); $cpts = $c02->getTimestamp(); } catch (\Exception $e) { $cpts = null; }
                            }
                            if (!empty($cpts)) {
                                $cpa['date_exec_ts'] = $cpts;
                                try { $iso = \Carbon\Carbon::createFromTimestamp($cpts, 'UTC')->toIso8601String(); $fmt = \Carbon\Carbon::createFromTimestamp($cpts, 'UTC')->format('Y-m-d H:i:s P'); } catch (\Exception $e) { $iso = null; $fmt = null; }
                                $cpa['date_exec_iso'] = $iso;
                                if (!empty($iso)) { $cpa['date_executed_iso'] = $iso; }
                                if (!empty($fmt)) { $cpa['date_executed'] = $fmt; }
                            }

                            // Compare campaign timestamp with current best
                            if ($best && !empty($best['date_exec_ts']) && !empty($cpa['date_exec_ts'])) {
                                if ((int)$cpa['date_exec_ts'] > (int)$best['date_exec_ts']) {
                                    $best = $cpa;
                                }
                            } elseif (!$best) {
                                $best = $cpa;
                            }
                        }

                        if ($best) {
                            $latestOutboundMap[$ph] = $best;
                            try {
                                Log::info('latestOutbound pick', [
                                    'phone' => $ph,
                                    'best_id' => $best['id'] ?? null,
                                    'best_body' => isset($best['message_body']) ? mb_substr($best['message_body'],0,200) : null,
                                    'best_ts' => $best['date_exec_ts'] ?? null,
                                    'best_date_sent' => $best['date_sent'] ?? null,
                                    'best_created_at' => $best['created_at'] ?? null,
                                    'outbound_by_number_id' => isset($o) && is_object($o) ? ($o->id ?? null) : (is_array($o) ? ($o['id'] ?? null) : null),
                                    'auto_response_id' => isset($a) && is_object($a) ? ($a->id ?? null) : (is_array($a) ? ($a['id'] ?? null) : null),
                                    'outbound_by_conv_id' => isset($obByConv) && is_object($obByConv) ? ($obByConv->id ?? null) : (is_array($obByConv) ? ($obByConv['id'] ?? null) : null),
                                ]);
                            } catch (\Exception $e) {
                                // swallow logging errors
                            }
                        } else {
                            Log::info('latestOutbound pick - no candidates found', [
                                'phone' => $ph,
                                'conv_id' => $convIdForPhone,
                                'inbound_id' => $inboundIdForPhone,
                            ]);
                        }
                    } catch (\Exception $e) {
                        // ignore per-phone failures
                    }
                }
            } catch (\Exception $e) {
                Log::warning('Failed to batch fetch outbound latests: ' . $e->getMessage());
            }
        }

        // Attach a normalized "latest_message" entry to each inbound item.
    $items = array_map(function ($m) use ($latestOutboundMap, $appTz) {
            $phone = isset($m['from_number']) ? $m['from_number'] : null;

            // Normalize inbound timestamp
            $inboundTs = null;
            // Prefer Twilio-reported received_at (received_at_iso) for inbound
            // otherwise fall back to any created_at if present on the source.
            if (!empty($m['received_at_iso'])) {
                try { $dt = new \Carbon\Carbon($m['received_at_iso']); $dt->setTimezone($appTz); $inboundTs = $dt; } catch (\Exception $e) { $inboundTs = null; }
            } elseif (!empty($m['created_at'])) {
                try { $dt = new \Carbon\Carbon($m['created_at']); $dt->setTimezone($appTz); $inboundTs = $dt; } catch (\Exception $e) { $inboundTs = null; }
            }

            // Try to find an outbound candidate in the map using normalized phone variants
            $outbound = null;
            if (!empty($phone) && is_string($phone)) {
                $rawp = trim((string)$phone);
                $lookupCandidates = [$rawp];
                if (preg_match('/^[0-9]+$/', $rawp)) {
                    $lookupCandidates[] = '+' . $rawp;
                } else {
                    $digitsOnly = preg_replace('/\D+/', '', $rawp);
                    if (!empty($digitsOnly)) {
                        $lookupCandidates[] = $digitsOnly;
                        $lookupCandidates[] = '+' . $digitsOnly;
                    }
                    if (strlen($rawp) > 0 && $rawp[0] !== '+') {
                        $lookupCandidates[] = '+' . $rawp;
                    }
                }
                $lookupCandidates = array_values(array_unique(array_filter($lookupCandidates, function ($v) { return $v !== null && $v !== ''; })));
                foreach ($lookupCandidates as $cand) {
                    if (isset($latestOutboundMap[$cand])) { $outbound = $latestOutboundMap[$cand]; break; }
                }
                // If no outbound found by phone variants, try matching by conversation_id / twilio_sid
                if (empty($outbound)) {
                    $conv = $m['conversation_id'] ?? ($m['twilio_sid'] ?? null);
                    if (!empty($conv)) {
                        foreach ($latestOutboundMap as $lk => $lv) {
                            if (!empty($lv['conversation_id']) && $lv['conversation_id'] == $conv) { $outbound = $lv; break; }
                            // Some outbound rows may expose conversation id under 'conv_id' or similar — check common keys
                            if (!empty($lv['conv_id']) && $lv['conv_id'] == $conv) { $outbound = $lv; break; }
                        }
                    }
                }

                // Log the lookup attempt
                try {
                    Log::info('latest_message lookup', [
                        'inbound_id' => $m['id'] ?? null,
                        'phone' => $phone,
                        'lookup_candidates' => $lookupCandidates,
                        'conversation_id' => $m['conversation_id'] ?? null,
                        'twilio_sid' => $m['twilio_sid'] ?? null,
                        'outbound_found' => !empty($outbound),
                        'outbound_id' => $outbound['id'] ?? null,
                    ]);
                } catch (\Exception $e) {
                    // swallow logging errors
                }
            }
            $outboundTs = null;
            // Prefer a pre-computed numeric epoch timestamp when available (date_exec_ts),
            // otherwise prefer outbound.date_sent, then created_at. Convert to app timezone.
            if ($outbound) {
                if (!empty($outbound['date_exec_ts']) && is_numeric($outbound['date_exec_ts'])) {
                    try { $dt2 = \Carbon\Carbon::createFromTimestampUTC((int)$outbound['date_exec_ts']); $dt2->setTimezone($appTz); $outboundTs = $dt2; } catch (\Exception $e) { $outboundTs = null; }
                } elseif (!empty($outbound['date_sent'])) {
                    try { $dt2 = new \Carbon\Carbon($outbound['date_sent']); $dt2->setTimezone($appTz); $outboundTs = $dt2; } catch (\Exception $e) { $outboundTs = null; }
                } elseif (!empty($outbound['created_at'])) {
                    try { $dt2 = new \Carbon\Carbon($outbound['created_at']); $dt2->setTimezone($appTz); $outboundTs = $dt2; } catch (\Exception $e) { $outboundTs = null; }
                }
            }

            $latest = null;

            // Helper to build latest object from a source array and a Carbon ts
            // Attach a numeric epoch (UTC) as 'date_exec_ts' so callers can sort reliably.
            $buildLatest = function ($direction, $source, $ts = null) use ($m) {
                $date_exec = null;
                $date_exec_iso = null;
                $date_exec_ts = null;
                if ($ts) {
                    try { $date_exec = $ts->format('Y-m-d H:i:s P'); $date_exec_iso = $ts->toIso8601String(); $date_exec_ts = $ts->getTimestamp(); } catch (\Exception $e) { $date_exec = null; $date_exec_iso = null; $date_exec_ts = null; }
                }
                // Fallbacks for timestamps when Carbon isn't available
                if (empty($date_exec_iso)) {
                    if (!empty($source['date_sent'])) {
                        try { $d = new \Carbon\Carbon($source['date_sent']); $date_exec = $d->format('Y-m-d H:i:s P'); $date_exec_iso = $d->toIso8601String(); $date_exec_ts = $d->getTimestamp(); } catch (\Exception $e) { /* ignore */ }
                    } elseif (!empty($source['created_at'])) {
                        try { $d = new \Carbon\Carbon($source['created_at']); $date_exec = $d->format('Y-m-d H:i:s P'); $date_exec_iso = $d->toIso8601String(); $date_exec_ts = $d->getTimestamp(); } catch (\Exception $e) { /* ignore */ }
                    } elseif (!empty($m['received_at_iso'])) {
                        try { $d = new \Carbon\Carbon($m['received_at_iso']); $date_exec = $d->format('Y-m-d H:i:s P'); $date_exec_iso = $d->toIso8601String(); $date_exec_ts = $d->getTimestamp(); } catch (\Exception $e) { $date_exec = $m['received_at']; $date_exec_iso = $m['received_at_iso']; }
                    }
                }

                return [
                    'direction' => $direction,
                    'message_body' => ($source['message_body'] ?? $source['body'] ?? $m['message_body'] ?? null),
                    'date_executed' => $date_exec,
                    'date_executed_iso' => $date_exec_iso,
                    // numeric epoch (UTC) to allow reliable sorting server-side
                    'date_exec_ts' => $date_exec_ts,
                    'twilio_sid' => ($source['twilio_sid'] ?? $m['twilio_sid'] ?? null),
                    'id' => ($source['id'] ?? $m['id'] ?? null),
                ];
            };

            if ($outboundTs && $inboundTs) {
                if ($outboundTs->gt($inboundTs)) {
                    $latest = $buildLatest('outbound', $outbound, $outboundTs);
                } else {
                    $latest = $buildLatest('inbound', $m, $inboundTs);
                }
            } elseif ($outboundTs) {
                $latest = $buildLatest('outbound', $outbound, $outboundTs);
            } elseif ($inboundTs) {
                $latest = $buildLatest('inbound', $m, $inboundTs);
            } else {
                // fallback: try to extract timestamps from available fields
                $latest = $buildLatest('inbound', $m, null);
            }

            // Log the comparison for debugging
            try {
                Log::info('latest_message comparison', [
                    'inbound_id' => $m['id'] ?? null,
                    'phone' => $phone,
                    'inbound_ts' => $inboundTs ? $inboundTs->toIso8601String() : null,
                    'outbound_ts' => $outboundTs ? $outboundTs->toIso8601String() : null,
                    'outbound_found' => !empty($outbound),
                    'chosen_direction' => $latest['direction'] ?? null,
                    'chosen_ts' => $latest['date_exec_ts'] ?? null,
                    'outbound_id' => $outbound['id'] ?? null,
                ]);
            } catch (\Exception $e) {
                // swallow logging errors
            }

            $m['latest_message'] = $latest;
            return $m;
        }, $items);

        // Sort items by latest_message timestamp (prefer numeric epoch date_exec_ts).
        usort($items, function ($a, $b) {
            $geta = $a['latest_message']['date_exec_ts'] ?? null;
            $getb = $b['latest_message']['date_exec_ts'] ?? null;
            // If both have numeric epochs, compare directly
            if (is_numeric($geta) && is_numeric($getb)) {
                return ((int)$getb) <=> ((int)$geta);
            }
            // Otherwise fall back to ISO strings
            $isa = $a['latest_message']['date_executed_iso'] ?? ($a['received_at_iso'] ?? null);
            $isb = $b['latest_message']['date_executed_iso'] ?? ($b['received_at_iso'] ?? null);
            if ($isa && $isb) {
                try {
                    $ta = (new \Carbon\Carbon($isa))->getTimestamp();
                    $tb = (new \Carbon\Carbon($isb))->getTimestamp();
                    return $tb <=> $ta;
                } catch (\Exception $e) {
                    return 0;
                }
            }
            // Final fallback: prefer items with any latest_message over none, then by id desc
            if (!empty($a['latest_message']) && empty($b['latest_message'])) return -1;
            if (empty($a['latest_message']) && !empty($b['latest_message'])) return 1;
            return ($b['id'] ?? 0) <=> ($a['id'] ?? 0);
        });

        return response()->json([
            'data' => $items,
            'total' => $paginator->total(),
            'per_page' => $paginator->perPage(),
            'current_page' => $paginator->currentPage(),
            'last_page' => $paginator->lastPage(),
            'sort_by' => $sortBy,
            'sort_dir' => $sortDir,
        ]);
    }

    /**
     * Send a reply to an inbound message using Twilio and log the outbound message.
     * Expects JSON: { message: "text" }
     */
    public function reply(Request $request, $id)
    {
        
        $message = $this->findInbound($id);
        if (!$message) {
            return response()->json(['error' => 'Not found'], 404);
        }

        $body = (string) $request->input('message', '');
        if (trim($body) === '') {
            return response()->json(['error' => 'Message is required'], 422);
        }

    list($twilio, $from) = $this->getTwilioClientAndFrom();
    try {
            $response = $twilio->messages->create(
                $message->from_number,
                ['from' => $from, 'body' => $body]
            );

            // Record outbound in outbound_messages table. Prefer to derive conversation_id
            // from an explicit phone passed by the client so replies link to the phone thread.
            if (class_exists('\App\\Models\\OutboundMessage')) {
                try {
                    $convId = null;
                    // If client supplied a phone, try to find the latest inbound with that from_number
                    $phoneFromClient = trim((string) $request->input('phone', '')) ?: null;
                    if (!empty($phoneFromClient)) {
                        try {
                            $latestByPhone = InboundMessage::where('from_number', $phoneFromClient)->orderBy('created_at', 'desc')->first();
                            if ($latestByPhone) {
                                $convId = $latestByPhone->conversation_id ?: ($latestByPhone->twilio_sid ?: null);
                            }
                        } catch (\Exception $e) {
                            // ignore lookup error and fall back below
                        }
                    }

                    // fall back to conversation on the inbound message if no phone-derived conv found
                    if (empty($convId)) {
                        $convId = $message->conversation_id ?? ($message->twilio_sid ?: null);
                    }

                    \App\Models\OutboundMessage::create([
                        'to_number' => $message->from_number,
                        'message_body' => $body,
                        'status' => $response->status ?? 'sent',
                        'twilio_sid' => $response->sid ?? null,
                        'conversation_id' => $convId,
                    ]);
                } catch (\Exception $e) {
                    Log::warning('Failed to record outbound message: ' . $e->getMessage());
                }
            }

            return response()->json(['status' => 'ok', 'twilio_sid' => $response->sid ?? null]);
        } catch (\Exception $e) {
            // include trace to aid debugging in logs
            Log::error('Failed to send reply: ' . $e->getMessage(), ['exception' => $e->getTraceAsString()]);
            return response()->json(['error' => 'failed', 'message' => $e->getMessage()], 500);
        }
    }

    /**
     * Return the full conversation thread for a given inbound message id.
     * Includes inbound + outbound messages ordered by created_at.
     */
    public function thread($id)
    {
    $message = $this->findInbound($id);
        if (!$message) {
            return response()->json(['error' => 'Not found'], 404);
        }

        $convId = $message->conversation_id ?: $message->twilio_sid;

        $inbound = collect();
        $outbound = collect();

        if ($convId) {
            // Fetch inbound messages sharing the conversation_id
            $inbound = InboundMessage::where('conversation_id', $convId)->get()->map(function ($m) { return array_merge($m->toArray(), ['direction' => 'inbound']); });

            // Also fetch outbound messages that either have the same conversation_id
            // OR reference the same phone number (to_number/from_number). This makes
            // threads resilient to historical rows that didn't get linked by
            // conversation_id but do match by phone.
            if (class_exists('\App\\Models\\OutboundMessage')) {
                try {
                    $phone = $message->from_number ?: null;
                    $outQuery = \App\Models\OutboundMessage::where('conversation_id', $convId);
                    if ($phone) {
                        // outbound_messages stores the recipient as to_number; don't
                        // query non-existent from_number column here to avoid SQL errors.
                        $outQuery = $outQuery->orWhere(function($q) use ($phone) {
                            $q->where('to_number', $phone);
                        });
                    }
                    $outbound = $outQuery->get()->map(function ($m) { return array_merge($m->toArray(), ['direction' => 'outbound']); });
                } catch (\Exception $e) {
                    $outbound = collect();
                }
            }
            // If conversation-based lookup returned very little, try phone-based search too
            // (covers historical outbound rows that weren't linked with conversation_id)
            try {
                $inboundCount = count($inbound);
                $outboundCount = count($outbound);
                // If there are no outbound rows associated with the conversation,
                // also try a phone-based search to include any historical outbound
                // messages that were not linked by conversation_id.
                if ($outboundCount === 0) {
                    $phone = $message->from_number ?: null;
                    if ($phone) {
                        // inbound table only stores the sender as from_number — search on that
                        $phoneInbound = InboundMessage::where('from_number', $phone)->orderBy('created_at', 'desc')->take(200)->get()->map(function ($m) { return array_merge($m->toArray(), ['direction' => 'inbound']); });

                            if (class_exists('\App\\Models\\OutboundMessage')) {
                            // Only match recipient column (to_number) — outbound_messages
                            // does not have a from_number column in this schema.
                            $phoneOutbound = \App\Models\OutboundMessage::where('to_number', $phone)->orderBy('created_at', 'desc')->take(200)->get()->map(function ($m) { return array_merge($m->toArray(), ['direction' => 'outbound']); });
                        } else {
                            $phoneOutbound = collect();
                        }

                        // merge phone-based results into our existing collections
                        $inbound = collect($inbound)->merge($phoneInbound);
                        $outbound = collect($outbound)->merge($phoneOutbound);
                    }
                }
            } catch (\Exception $e) {
                // ignore fallback failures
            }
        } else {
            // No convId available: fall back to retrieving recent messages by phone number
            $phone = $message->from_number ?: null;
            if ($phone) {
                // search inbound where either side matches (some imports may flip to_number/from_number)
                // inbound_messages stores the sender in from_number only
                $inbound = InboundMessage::where('from_number', $phone)->orderBy('created_at', 'desc')->take(200)->get()->map(function ($m) { return array_merge($m->toArray(), ['direction' => 'inbound']); });

                if (class_exists('\App\\Models\\OutboundMessage')) {
                    // Only match outgoing messages where we were the sender's recipient (to_number)
                    $outbound = \App\Models\OutboundMessage::where('to_number', $phone)->orderBy('created_at', 'desc')->take(200)->get()->map(function ($m) { return array_merge($m->toArray(), ['direction' => 'outbound']); });
                }

                // log counts so we can diagnose client/server mismatches
                try {
                    Log::info('Inbound thread fallback used', ['id' => $message->id, 'phone' => $phone, 'inbound_count' => count($inbound), 'outbound_count' => count($outbound)]);
                } catch (\Exception $e) {
                    // swallow logging errors
                }
            } else {
                // As a last resort return the single message
                return response()->json(['data' => [$message->toArray()]]);
            }
        }

        $combined = collect($inbound)->merge($outbound)->sortBy(function ($r) {
            return $r['created_at'] ?? ($r['received_at'] ?? null);
        })->values()->all();

        return response()->json(['data' => $combined]);
    }

    /**
     * Return a merged conversation thread for a phone number (inbound + outbound).
     * Accepts either +61412345678 or 61412345678 and normalizes the input.
     */
    public function threadByPhone($phone)
    {
        if (empty($phone)) {
            return response()->json(['error' => 'phone required'], 422);
        }

        // Normalize phone: ensure it starts with + when appropriate
        $p = trim((string) $phone);
        if (preg_match('/^[0-9]+$/', $p)) {
            // assume local numbers are given without + — keep as-is but also try with +
            $candidates = [$p, '+' . $p];
        } else {
            $candidates = [$p];
            if ($p[0] !== '+') $candidates[] = '+' . $p;
        }

        $inbound = collect();
        $outbound = collect();

        try {
            // inbound_messages stores sender in from_number
            $inbound = InboundMessage::whereIn('from_number', $candidates)->orderBy('created_at', 'asc')->get()->map(function ($m) { return array_merge($m->toArray(), ['direction' => 'inbound']); });

            if (class_exists('\App\\Models\\OutboundMessage')) {
                $outbound = \App\Models\OutboundMessage::whereIn('to_number', $candidates)->orderBy('created_at', 'asc')->get()->map(function ($m) { return array_merge($m->toArray(), ['direction' => 'outbound']); });
            }
        } catch (\Exception $e) {
            return response()->json(['error' => 'failed', 'message' => $e->getMessage()], 500);
        }

        $combined = collect($inbound)->merge($outbound)->sortBy(function ($r) {
            return $r['created_at'] ?? ($r['received_at'] ?? null);
        })->values()->all();

        return response()->json(['data' => $combined]);
    }

    /**
     * Mark an inbound message as read.
     */
    public function markRead(Request $request, $id)
    {
    $message = $this->findInbound($id);
        if (!$message) {
            return response()->json(['error' => 'Not found'], 404);
        }
        $message->status = 'read';
        $message->save();
        return response()->json(['status' => 'ok']);
    }

    /**
     * Mark inbound messages as read for a given phone number (accepts +614... or 614...)
     */
    public function markReadByPhone(Request $request, $phone)
    {
        $p = trim((string) $phone);
        if ($p === '') {
            return response()->json(['error' => 'phone required'], 422);
        }

        // Normalize candidates: raw and +prefixed
        $candidates = [$p];
        if ($p[0] !== '+') {
            $candidates[] = '+' . $p;
        }

        try {

            // Also update the unified `inbox` table so the inbox UI reflects the read state.
            // Match by from_number or to_number using the same candidate forms.
            $inboxQuery = Inbox::whereIn('from_number', $candidates)->orWhereIn('to_number', $candidates);
            $inboxUpdated = $inboxQuery->update(['status' => 'read', 'is_read' => true, 'read_at' => now(), 'updated_at' => now()]);

            return response()->json(['status' => 'ok', 'updated' => $updated, 'inbox_updated' => $inboxUpdated]);
        } catch (\Exception $e) {
            Log::error('Failed to markReadByPhone: ' . $e->getMessage());
            return response()->json(['error' => 'failed', 'message' => $e->getMessage()], 500);
        }
    }

    /**
     * Mark an inbound message as unread.
     */
    public function markUnread(Request $request, $id)
    {
    $message = $this->findInbound($id);
        if (!$message) {
            return response()->json(['error' => 'Not found'], 404);
        }
        $message->status = 'received';
        $message->save();
        return response()->json(['status' => 'ok']);
    }

    /**
     * Delete an inbound message.
     */
    public function destroy($id)
    {
    $message = $this->findInbound($id);
        if (!$message) {
            return response()->json(['error' => 'Not found'], 404);
        }
        // store twilio sid tombstone if present
        try {
            if (!empty($message->twilio_sid)) {
                DB::table('deleted_inbound_twilio_sids')->updateOrInsert([
                    'twilio_sid' => $message->twilio_sid
                ], [ 'deleted_by' => null, 'created_at' => now(), 'updated_at' => now() ]);
            }
        } catch (\Exception $e) {
            // log and continue
            Log::warning('Failed to record tombstone for inbound message: ' . $e->getMessage());
        }
        // Delete the inbound message (note: InboundMessage doesn't use SoftDeletes so this is a hard delete)
        $message->delete();

        // Also attempt to soft-delete any related rows in the unified `inbox` table so they are hidden from the UI.
        try {
            // Prefer explicit linkage via source_table/source_id when available.
            $inboxMatched = false;
            if (!empty($message->id)) {
                $matches = \App\Models\Inbox::where('source_table', 'inbound_messages')->where('source_id', $message->id)->get();
                foreach ($matches as $m) {
                    try { $m->delete(); } catch (\Exception $e) { /* ignore per-row failures */ }
                }
                if ($matches->count() > 0) $inboxMatched = true;
            }

            // If no explicit source linkage, try matching by twilio_sid, then conversation_id, then phone
            if (!$inboxMatched) {
                if (!empty($message->twilio_sid)) {
                    \App\Models\Inbox::where('twilio_sid', $message->twilio_sid)->get()->each(function($r){ try { $r->delete(); } catch (\Exception $e) {} });
                } elseif (!empty($message->conversation_id)) {
                    \App\Models\Inbox::where('conversation_id', $message->conversation_id)->get()->each(function($r){ try { $r->delete(); } catch (\Exception $e) {} });
                } elseif (!empty($message->from_number)) {
                    // soft-delete inbound-direction rows that match the from_number
                    \App\Models\Inbox::where('from_number', $message->from_number)->where(function($q){ $q->where('direction', '!=', 'outbound')->orWhere('direction', 'not like', '%out%'); })->get()->each(function($r){ try { $r->delete(); } catch (\Exception $e) {} });
                }
            }
        } catch (\Exception $e) {
            Log::warning('Failed to soft-delete related inbox rows for inbound destroy: ' . $e->getMessage());
        }
        return response()->json(['status' => 'deleted']);
    }

    /**
     * Toggle star on an inbound message (persisted)
     */
    public function toggleStar(Request $request, $id)
    {
        $message = $this->findInbound($id);
        if ($message) {
            $message->is_starred = !$message->is_starred;
            $message->save();
            return response()->json(['status' => 'ok', 'is_starred' => (bool) $message->is_starred]);
        }

        // Fallback: if an InboundMessage wasn't found, try toggling an Inbox row (new unified table)
        try {
            $inbox = Inbox::find($id);
            if ($inbox) {
                $inbox->is_starred = !$inbox->is_starred;
                $inbox->save();
                return response()->json(['status' => 'ok', 'is_starred' => (bool) $inbox->is_starred]);
            }
        } catch (\Exception $e) {
            Log::warning('toggleStar inbox fallback failed: ' . $e->getMessage());
        }

        return response()->json(['error' => 'Not found'], 404);
    }

    /**
     * Archive an inbound message (sets archived_at and status)
     */
    public function archive(Request $request, $id)
    {
    $message = $this->findInbound($id);
        if (!$message) {
            return response()->json(['error' => 'Not found'], 404);
        }
        $message->status = 'archived';
        $message->archived_at = now();
        $message->save();
        return response()->json(['status' => 'ok']);
    }

    /**
     * Log that a message was viewed/previewed by a user.
     */
    public function logView(Request $request, $id)
    {
        $message = $this->findInbound($id);
        if (!$message) {
            // Backwards-compat: if caller passed an inbox id (from the unified inbox table),
            // mark that inbox row as read instead of returning 404. This helps clients that
            // still call the legacy /inbound/{id}/view-log endpoint with unified inbox IDs.
            try {
                $inbox = Inbox::find($id);
                if ($inbox) {
                    $inbox->status = 'read';
                    $inbox->is_read = true;
                    $inbox->read_at = now();
                    $inbox->save();
                    Log::info('Inbox message viewed via legacy inbound/view-log', ['inbox_id' => $inbox->id]);
                    return response()->json(['status' => 'ok']);
                }
            } catch (\Exception $e) {
                Log::warning('Failed to mark inbox row read in legacy logView fallback: ' . $e->getMessage());
            }

            return response()->json(['error' => 'Not found'], 404);
        }

        $viewerIp = $request->ip();
        $ua = $request->header('User-Agent');

        try {
            InboundMessageView::create([
                'inbound_message_id' => $message->id,
                'viewer_ip' => $viewerIp,
                'user_agent' => $ua,
                'viewed_at' => now(),
            ]);
            // server-side log for analytics / audit
            Log::info('Inbound message viewed', ['id' => $message->id, 'viewer_ip' => $viewerIp]);
        } catch (\Exception $e) {
            Log::warning('Failed to record inbound message view: ' . $e->getMessage());
        }

        return response()->json(['status' => 'ok']);
    }

    /**
     * Bulk delete inbound messages by IDs.
     * Expects JSON body: { ids: [1,2,3] }
     */
    public function bulkDelete(Request $request)
    {
        $ids = $request->input('ids');
        if (!is_array($ids) || empty($ids)) {
            return response()->json(['error' => 'No ids provided'], 422);
        }

        try {
            // Fetch messages first so we can record tombstones and soft-delete related inbox rows.
            // Accept either numeric DB ids or Twilio SIDs passed from the client.
            $idsNumeric = array_values(array_filter($ids, function($v){ return is_numeric($v); }));
            $idsStrings = array_values(array_filter($ids, function($v){ return !is_numeric($v) && is_string($v) && trim($v) !== ''; }));

            $query = InboundMessage::query();
            if (!empty($idsNumeric)) {
                $query->orWhereIn('id', $idsNumeric);
            }
            if (!empty($idsStrings)) {
                $query->orWhereIn('twilio_sid', $idsStrings);
            }
            $messages = $query->get(['id', 'twilio_sid', 'conversation_id', 'from_number']);
            foreach ($messages as $msg) {
                $sid = $msg->twilio_sid ?? null;
                if (!empty($sid)) {
                    try {
                        DB::table('deleted_inbound_twilio_sids')->updateOrInsert([
                            'twilio_sid' => $sid
                        ], [ 'deleted_by' => null, 'created_at' => now(), 'updated_at' => now() ]);
                    } catch (\Exception $e) {
                        Log::warning('Failed to record tombstone for sid ' . $sid . ': ' . $e->getMessage());
                    }
                }

                // Soft-delete any matching inbox rows for this message
                try {
                    $inboxMatched = false;
                    if (!empty($msg->id)) {
                        $matches = \App\Models\Inbox::where('source_table', 'inbound_messages')->where('source_id', $msg->id)->get();
                        foreach ($matches as $m) { try { $m->delete(); } catch (\Exception $e) { } }
                        if ($matches->count() > 0) $inboxMatched = true;
                    }
                    if (!$inboxMatched) {
                        if (!empty($msg->twilio_sid)) {
                            \App\Models\Inbox::where('twilio_sid', $msg->twilio_sid)->get()->each(function($r){ try { $r->delete(); } catch (\Exception $e) {} });
                        } elseif (!empty($msg->conversation_id)) {
                            \App\Models\Inbox::where('conversation_id', $msg->conversation_id)->get()->each(function($r){ try { $r->delete(); } catch (\Exception $e) {} });
                        } elseif (!empty($msg->from_number)) {
                            \App\Models\Inbox::where('from_number', $msg->from_number)->where(function($q){ $q->where('direction', '!=', 'outbound')->orWhere('direction', 'not like', '%out%'); })->get()->each(function($r){ try { $r->delete(); } catch (\Exception $e) {} });
                        }
                    }
                } catch (\Exception $e) {
                    Log::warning('Failed to soft-delete related inbox rows for inbound bulkDelete: ' . $e->getMessage());
                }
            }

            // Now delete the inbound messages (hard delete as before)
            // Perform deletion by matching ids and/or twilio_sids to cover both cases
            $delQuery = InboundMessage::query();
            if (!empty($idsNumeric)) $delQuery->orWhereIn('id', $idsNumeric);
            if (!empty($idsStrings)) $delQuery->orWhereIn('twilio_sid', $idsStrings);
            $deleted = $delQuery->delete();
            return response()->json(['status' => 'ok', 'deleted' => $deleted]);
        } catch (\Exception $e) {
            Log::error('Failed bulk delete inbound messages: ' . $e->getMessage(), ['ids' => $ids]);
            return response()->json(['error' => 'failed', 'message' => $e->getMessage()], 500);
        }
    }

    /**
     * Determine if a message is likely an order based on keywords.
     *
     * @param string $message
     * @return bool
     */
    private function isOrderMessage($message)
    {
        $keywords = [
            'order',
            'pickup',
            'delivery',
            'site contact',
            'address',
            'date',
            'time',
        ];

        $message = strtolower($message);

        foreach ($keywords as $keyword) {
            if (strpos($message, $keyword) !== false) {
                return true;
            }
        }
        return false;
    }

    /**
     * Find an InboundMessage by numeric id, twilio_sid, or phone number.
     * Accepts either: 123 (id), 'SMxxxx' (twilio sid), or a phone string like +61412345678
     *
     * @param mixed $idOrPhone
     * @return InboundMessage|null
     */
    private function findInbound($idOrPhone)
    {        
        if (empty($idOrPhone)) return null;

        // if numeric-ish, try id first
        if (is_numeric($idOrPhone) || (is_string($idOrPhone) && preg_match('/^[0-9]+$/', $idOrPhone))) {
            $intId = (int) $idOrPhone;
            // direct inbound lookup by id
            $m = InboundMessage::find($intId);
            if ($m) return $m;

            // If not found, try to map numeric id -> outbound_messages (use to_number)
            if (class_exists('\App\\Models\\OutboundMessage')) {
                try {
                    $o = \App\Models\OutboundMessage::find($intId);
                    if ($o && !empty($o->to_number)) {
                        $m = InboundMessage::where('from_number', $o->to_number)->orderBy('created_at', 'desc')->first();
                        if ($m) return $m;
                    }
                } catch (\Exception $e) {
                    // ignore and continue
                }
            }

            // Also try mapping numeric id -> inbox (conversation) record and derive a phone/source
            try {
                $inbox = Inbox::find($intId);
                if ($inbox) {
                    // prefer explicit source linkage
                    if (!empty($inbox->source_table) && $inbox->source_table === 'inbound_messages' && !empty($inbox->source_id)) {
                        $m = InboundMessage::find($inbox->source_id);
                        if ($m) return $m;
                    }
                    // fallback: use phone fields from inbox to find latest inbound
                    $phoneCandidate = $inbox->from_number ?? $inbox->to_number ?? $inbox->group_number ?? null;
                    if (!empty($phoneCandidate)) {
                        $m = InboundMessage::where('from_number', $phoneCandidate)->orderBy('created_at', 'desc')->first();
                        if ($m) return $m;
                    }
                }
            } catch (\Exception $e) {
                // ignore and continue
            }
        }

        
        // if it looks like a Twilio SID (starts with SM) or contains letters, try twilio_sid
        if (is_string($idOrPhone) && preg_match('/^[A-Za-z0-9_\-]+$/', $idOrPhone)) {
            $m = InboundMessage::where('twilio_sid', $idOrPhone)->first();
            if ($m) return $m;
        }

        // otherwise treat as a phone number — attempt matching on inbound.from_number
        $phone = (string) $idOrPhone;        

        // Build candidate phone variants (raw, +prefixed, digits-only)
        $raw = trim($phone);
        $candidates = [$raw];
        if (preg_match('/^[0-9]+$/', $raw)) {
            $candidates[] = '+' . $raw;
        } else {
            $digits = preg_replace('/\D+/', '', $raw);
            if (!empty($digits)) {
                $candidates[] = $digits;
                $candidates[] = '+' . $digits;
            }
            if (strlen($raw) > 0 && $raw[0] !== '+') {
                $candidates[] = '+' . $raw;
            }
        }
        $candidates = array_values(array_unique(array_filter($candidates, function ($v) { return $v !== null && $v !== ''; })));

        // Try inbound_messages by from_number first
        try {
            $m = InboundMessage::whereIn('from_number', $candidates)->orderBy('created_at', 'desc')->first();
            if ($m) return $m;
        } catch (\Exception $e) {
            // ignore and continue to outbound-based lookup
        }

        // If not found in inbound, try to locate a related outbound message by to_number
        if (class_exists('\App\\Models\\OutboundMessage')) {
            try {
                $o = \App\Models\OutboundMessage::whereIn('to_number', $candidates)->orderBy('created_at', 'desc')->first();
                if ($o) {
                    // Prefer mapping by conversation_id or twilio_sid if present
                    if (!empty($o->conversation_id)) {
                        $m = InboundMessage::where('conversation_id', $o->conversation_id)->orderBy('created_at', 'desc')->first();
                        if ($m) return $m;
                    }
                    if (!empty($o->twilio_sid)) {
                        $m = InboundMessage::where('twilio_sid', $o->twilio_sid)->orderBy('created_at', 'desc')->first();
                        if ($m) return $m;
                    }
                    // Fallback: try inbound by the outbound->to_number (recipient = customer)
                    if (!empty($o->to_number)) {
                        $m = InboundMessage::where('from_number', $o->to_number)->orderBy('created_at', 'desc')->first();
                        if ($m) return $m;
                    }
                }
            } catch (\Exception $e) {
                // ignore outbound lookup failures
            }
        }

        return null;
    }

    /**
     * Normalize Twilio date objects/strings into a value Carbon can parse.
     * Returns null when no usable date was found.
     * Accepts DateTime instances, SDK wrapper objects with a 'date' string, or raw strings.
     *
     * @param mixed $val
     * @return string|null
     */
    private function normalizeTwilioDate($val)
    {
        if (empty($val)) return null;

        // If it's already a DateTime / DateTimeImmutable
        if ($val instanceof \DateTimeInterface) {
            return $val->format('Y-m-d H:i:s');
        }

        // Twilio SDK sometimes returns an object with a public 'date' string
        if (is_object($val) && property_exists($val, 'date') && is_string($val->date)) {
            return $val->date;
        }

        // If object exposes format(), call it
        if (is_object($val) && method_exists($val, 'format')) {
            return $val->format('Y-m-d H:i:s');
        }

        // If already a string
        if (is_string($val) || is_numeric($val)) {
            return (string) $val;
        }

        return null;
    }

    /**
     * Debug endpoint to show all messages for a phone number
     */
    public function debugPhoneMessages(Request $request, $phone)
    {
        if (empty($phone)) {
            return response()->json(['error' => 'phone required'], 422);
        }

        $results = [
            'phone' => $phone,
            'inbound_messages' => [],
            'outbound_messages' => [],
            'auto_response_logs' => [],
            'campaigns' => [],
        ];

        try {
            // Check inbound messages
            $inbound = InboundMessage::where('from_number', $phone)->orderBy('created_at', 'desc')->take(10)->get();
            $results['inbound_messages'] = $inbound->map(function($msg) {
                return [
                    'id' => $msg->id,
                    'message_body' => $msg->message_body,
                    'received_at' => $msg->received_at,
                    'conversation_id' => $msg->conversation_id,
                    'twilio_sid' => $msg->twilio_sid,
                ];
            });

            // Check outbound messages
            if (class_exists('\App\Models\OutboundMessage')) {
                $outbound = \App\Models\OutboundMessage::where('to_number', $phone)->orderBy('created_at', 'desc')->take(10)->get();
                $results['outbound_messages'] = $outbound->map(function($msg) {
                    return [
                        'id' => $msg->id,
                        'message_body' => $msg->message_body,
                        'date_sent' => $msg->date_sent,
                        'created_at' => $msg->created_at,
                        'conversation_id' => $msg->conversation_id,
                        'twilio_sid' => $msg->twilio_sid,
                    ];
                });
            }

            // Check auto response logs
            $autoResponses = AutoResponseLog::where('to_number', $phone)->orderBy('created_at', 'desc')->take(10)->get();
            $results['auto_response_logs'] = $autoResponses->map(function($msg) {
                return [
                    'id' => $msg->id,
                    'message_body' => $msg->message_body,
                    'created_at' => $msg->created_at,
                    'twilio_sid' => $msg->twilio_sid,
                ];
            });

            // Check campaigns
            if (class_exists('\App\Models\CampaignModel')) {
                $campaigns = \App\Models\CampaignModel::where('status', 'sent')
                    ->whereJsonContains('recipients', $phone)
                    ->orderBy('sent_at', 'desc')
                    ->take(10)
                    ->get();
                $results['campaigns'] = $campaigns->map(function($msg) {
                    return [
                        'id' => $msg->id,
                        'title' => $msg->title,
                        'message' => $msg->message,
                        'sent_at' => $msg->sent_at,
                        'created_at' => $msg->created_at,
                    ];
                });
            }

        } catch (\Exception $e) {
            $results['error'] = $e->getMessage();
        }

        return response()->json($results);
    }

    /**
     * Get Twilio client and from number.
     *
     * @return array [\Twilio\Rest\Client $twilio, string $from]
     */
    private function getTwilioClientAndFrom()
    {
        $sid    = config('services.twilio.sid');
        $token  = config('services.twilio.token');
        $from   = config('services.twilio.from');
        $twilio = new Client($sid, $token);

        return [$twilio, $from];
    }

}
