<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\OutboundMessage;
use App\Models\Contacts;
use App\Models\InboundMessage;
use Twilio\Rest\Client;
use Illuminate\Support\Facades\Config;

/**
 * Class OutboundMessageController
 *
 * Handles sending SMS via Twilio and logging each attempt.
 *
 * @package App\Http\Controllers
 */
class OutboundMessageController extends Controller
{
    /**
     * Send an SMS message via Twilio and log the attempt.
     *
     * @param \Illuminate\Http\Request $request
     * @return \Illuminate\Http\JsonResponse
     */
    public function send(Request $request)
    {
        $validated = $request->validate([
            'contact_id'   => 'required',
            'message_body' => 'required|string',
        ]);

        // Support both single and multiple contact_id(s)
        $contactIds = is_array($validated['contact_id'])
            ? $validated['contact_id']
            : [$validated['contact_id']];

        $results = [];

        // Twilio credentials from config or .env
        list($twilio, $from) = $this->getTwilioClientAndFrom();

        foreach ($contactIds as $cid) {
            $contact = Contacts::find($cid);
            if (!$contact) {
                $results[] = [
                    'contact_id' => $cid,
                    'status' => 'failed',
                    'error_message' => 'Contact not found',
                ];
                continue;
            }

            $toNumber = $contact->primary_no;
            $status = 'queued';
            $twilioSid = null;
            $error = null;

            try {
                // Append unsubscribe link to the message body when present for this contact
                $bodyToSend = $validated['message_body'];
                if (!empty($contact->unsubscribe_link)) {
                    // Place opt-out on its own visual block prefixed with an em-dash
                    // $bodyToSend .= "\n\n— Opt out: " . $contact->unsubscribe_link;
                }

                $message = $twilio->messages->create(
                    $toNumber,
                    [
                        'from' => $from,
                        'body' => $bodyToSend,
                    ]
                );
                $status = $message->status ?? 'sent';
                $twilioSid = $message->sid ?? null;
            } catch (\Exception $e) {
                $status = 'failed';
                $error = $e->getMessage();
            }

            // Attempt to link this outbound message to an existing inbound conversation
            $convId = null;
            try {
                $latestInbound = InboundMessage::where('from_number', $toNumber)->orderBy('created_at', 'desc')->first();
                if ($latestInbound) {
                    $convId = $latestInbound->conversation_id ?: ($latestInbound->twilio_sid ?: null);
                }
            } catch (\Exception $e) {
                // ignore DB lookup failure — proceed without conversation link
            }

            // Log the message attempt (store the actual body sent)
            $outbound = OutboundMessage::create([
                'contact_id'    => $contact->id,
                'to_number'     => $toNumber,
                'message_body'  => isset($bodyToSend) ? $bodyToSend : $validated['message_body'],
                'status'        => $status,
                'twilio_sid'    => $twilioSid,
                'conversation_id' => $convId ?: ($twilioSid ?: null),
                'error_message' => $error,
            ]);

            $results[] = [
                'contact_id'    => $contact->id,
                'to_number'     => $toNumber,
                'status'        => $status,
                'twilio_sid'    => $twilioSid,
                'error_message' => $error,
            ];
        }

        return response()->json([
            'results' => $results,
        ]);
    }

    /**
     * Send an SMS message to multiple contacts filtered by address_state and log each attempt.
     *
     * @param \Illuminate\Http\Request $request
     * @return \Illuminate\Http\JsonResponse
     */
    public function sendByState(Request $request)
    {
        $validated = $request->validate([
            'message_body'   => 'required|string',
            'address_states' => 'required|array|min:1',
            'address_states.*' => 'integer|exists:address_state,id',
        ]);

        $results = [];

        // Twilio credentials from config or .env
        list($twilio, $from) = $this->getTwilioClientAndFrom();

        foreach ($validated['address_states'] as $stateId) {
            // Get all contacts in this state
            $stateContacts = Contacts::where('address_state', $stateId)->get();

            $stateStatus = [];
            foreach ($stateContacts as $contact) {
                $toNumber = $contact->primary_no;

                $status = 'queued';
                $twilioSid = null;
                $error = null;

                try {
                    $bodyToSend = $validated['message_body'];
                    if (!empty($contact->unsubscribe_link)) {
                        // Place opt-out on its own visual block prefixed with an em-dash
                        // $bodyToSend .= "\n\n— Opt out: " . $contact->unsubscribe_link;
                    }

                    $message = $twilio->messages->create(
                        $toNumber,
                        [
                            'from' => $from,
                            'body' => $bodyToSend,
                        ]
                    );
                    $status = $message->status ?? 'sent';
                    $twilioSid = $message->sid ?? null;
                } catch (\Exception $e) {
                    $status = 'failed';
                    $error = $e->getMessage();
                }

                $stateStatus[] = [
                    'contact_id'    => $contact->id,
                    'to_number'     => $toNumber,
                    'status'        => $status,
                    'twilio_sid'    => $twilioSid,
                    'error_message' => $error,
                ];

                // Record per-contact outbound log and attempt to link to inbound conversation
                try {
                    $convId = null;
                    $latestInbound = InboundMessage::where('from_number', $toNumber)->orderBy('created_at', 'desc')->first();
                    if ($latestInbound) {
                        $convId = $latestInbound->conversation_id ?: ($latestInbound->twilio_sid ?: null);
                    }
                    OutboundMessage::create([
                        'contact_id' => $contact->id,
                        'to_number' => $toNumber,
                        'message_body' => $bodyToSend,
                        'status' => $status,
                        'twilio_sid' => $twilioSid,
                        'conversation_id' => $convId ?: ($twilioSid ?: null),
                    ]);
                } catch (\Exception $e) {
                    // non-fatal logging failure
                }
            }

            // Insert a single record for the state in outbound_messages
            OutboundMessage::create([
                'address_state_id' => $stateId,
                'contact_id'       => null,
                'to_number'        => null,
                'message_body'     => $validated['message_body'],
                'status'           => 'sent',
                'twilio_sid'       => null,
                'error_message'    => null,
            ]);

            $results[] = [
                'address_state_id' => $stateId,
                'contacts_sent'    => count($stateContacts),
                'details'          => $stateStatus,
            ];
        }

        return response()->json([
            'results' => $results,
        ]);
    }

    /**
     * Retrieve all sent outbound messages, most recent first.
     *
     * @return \Illuminate\Http\JsonResponse
     */
    public function getSentItems()
    {
        $messages = \App\Models\OutboundMessage::with(['contact', 'group', 'addressState'])
            ->orderBy('created_at', 'desc')
            ->get()
            ->map(function ($msg) {
                // Determine recipient_name based on which field is filled
                $recipientName = null;

                if ($msg->contact_id && $msg->contact) {
                    $recipientName = $msg->contact->first_name . ' ' . $msg->contact->last_name;
                } elseif ($msg->group_id && $msg->group) {
                    $recipientName = $msg->group->group_name;
                } elseif ($msg->address_state_id && $msg->addressState) {
                    $recipientName = $msg->addressState->state;
                }

                return [
                    'id' => $msg->id,
                    'sent_at' => $msg->date_sent,
                    'recipient_name' => !empty($recipientName)
                        ? $recipientName . ' (' . ($msg->to_number ?? '') . ')'
                        : ($msg->to_number ?? null),
                    'recipient_number' => $msg->to_number,
                    'message_body' => $msg->message_body,
                    'status' => $msg->status,
                ];
            });

        return response()->json($messages);
    }

    /**
     * Send an SMS message to all members of one or more groups.
     * Each group will receive one message (all members), and a record will be inserted for each group (not per contact).
     *
     * @param \Illuminate\Http\Request $request
     * @return \Illuminate\Http\JsonResponse
     */
    public function sendToGroups(Request $request)
    {
        $validated = $request->validate([
            'group_ids'     => 'required|array',
            'group_ids.*'   => 'exists:contact_groups,id',
            'message_body'  => 'required|string',
        ]);

        $results = [];

        // Twilio credentials from config or .env
        list($twilio, $from) = $this->getTwilioClientAndFrom();

        foreach ($validated['group_ids'] as $groupId) {
            // Get all contacts in this group
            $contacts = \App\Models\Contacts::where('group_no', $groupId)->get();

            $groupStatus = [];
            foreach ($contacts as $contact) {
                $toNumber = $contact->primary_no;

                $status = 'queued';
                $twilioSid = null;
                $error = null;

                try {
                    $bodyToSend = $validated['message_body'];
                    if (!empty($contact->unsubscribe_link)) {
                        // Place opt-out on its own visual block prefixed with an em-dash
                        // $bodyToSend .= "\n\n— Opt out: " . $contact->unsubscribe_link;
                    }

                    $message = $twilio->messages->create(
                        $toNumber,
                        [
                            'from' => $from,
                            'body' => $bodyToSend,
                        ]
                    );
                    $status = $message->status ?? 'sent';
                    $twilioSid = $message->sid ?? null;
                } catch (\Exception $e) {
                    $status = 'failed';
                    $error = $e->getMessage();
                }

                // Optionally, you can log each contact's delivery if you want
                $groupStatus[] = [
                    'contact_id'    => $contact->id,
                    'to_number'     => $toNumber,
                    'status'        => $status,
                    'twilio_sid'    => $twilioSid,
                    'error_message' => $error,
                ];
                // Also record an outbound_message for this contact so threads can be linked
                try {
                    $convId = null;
                    $latestInbound = InboundMessage::where('from_number', $toNumber)->orderBy('created_at', 'desc')->first();
                    if ($latestInbound) {
                        $convId = $latestInbound->conversation_id ?: ($latestInbound->twilio_sid ?: null);
                    }
                    \App\Models\OutboundMessage::create([
                        'contact_id' => $contact->id,
                        'to_number' => $toNumber,
                        'message_body' => $bodyToSend,
                        'status' => $status,
                        'twilio_sid' => $twilioSid,
                        'conversation_id' => $convId ?: ($twilioSid ?: null),
                    ]);
                } catch (\Exception $e) {
                    // ignore logging failures
                }
            }

            // Insert a single record for the group in outbound_messages
            \App\Models\OutboundMessage::create([
                'group_id'      => $groupId,
                'contact_id'    => null,
                'to_number'     => null,
                'message_body'  => $validated['message_body'],
                'status'        => 'sent', // or summarize groupStatus if you want
                'twilio_sid'    => null,
                'error_message' => null,
            ]);

            $results[] = [
                'group_id'      => $groupId,
                'contacts_sent' => count($contacts),
                'details'       => $groupStatus,
            ];
        }

        return response()->json([
            'results' => $results,
        ]);
    }

    /**
     * Delete one or more sent items from the outbound_messages table by id(s).
     *
     * @param \Illuminate\Http\Request $request
     * @return \Illuminate\Http\JsonResponse
     */
    public function deleteSentItems(Request $request)
    {
        $validated = $request->validate([
            'ids' => 'required|array|min:1',
            'ids.*' => 'integer|exists:outbound_messages,id',
        ]);

        $deleted = \App\Models\OutboundMessage::whereIn('id', $validated['ids'])->delete();

        return response()->json([
            'deleted_count' => $deleted,
            'message' => $deleted > 0
                ? 'Sent item(s) deleted successfully.'
                : 'No records deleted.',
        ]);
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

    /**
     * Sync recent outbound messages from Twilio into the local outbound_messages table.
     * Accepts optional query param: ?limit=50
     */
    public function syncOutboundFromTwilio(Request $request)
    {
        list($twilio, $from) = $this->getTwilioClientAndFrom();

        $limit = (int) $request->query('limit', 50);
        if ($limit <= 0) {
            $limit = 50;
        }

        try {
            // Read recent messages sent from our Twilio number
            $messages = $twilio->messages->read(['from' => $from], $limit);
        } catch (\Exception $e) {
            return response()->json(['error' => 'Failed to fetch messages from Twilio', 'detail' => $e->getMessage()], 500);
        }

        $checked = 0;
        $imported = 0;
        $errors = [];

        foreach ($messages as $m) {
            $checked++;

            // Only process outbound messages (use magic getter)
            $direction = $m->direction ?? null;
            if ($direction && stripos($direction, 'out') === false && stripos($direction, 'sent') === false) {
                continue;
            }

                // Prefer Twilio-provided timestamps (dateSent -> dateCreated -> dateUpdated)
                // Use a defensive accessor because Twilio SDK uses magic getters and
                // some wrapper objects can behave unexpectedly when probed by PHP functions.
                $sentRaw = null;
                foreach (['dateSent', 'dateCreated', 'dateUpdated'] as $k) {
                    try {
                        // Access via property-style magic getter; wrap in try/catch to be safe
                        $v = $m->{$k} ?? null;
                    } catch (\Throwable $ex) {
                        $v = null;
                    }
                    if (!empty($v)) { $sentRaw = $v; break; }
                }

            // Normalize Twilio timestamp into a Carbon-parsable string
            $sentAt = null;
            $normalized = $this->normalizeTwilioDate($sentRaw);
            if (!empty($normalized)) {
                try {
                    $dt = new \Carbon\Carbon($normalized);
                    $dt->setTimezone('UTC');
                    $sentAt = $dt->toDateTimeString();
                } catch (\Exception $e) {
                    $sentAt = null;
                }
            }
            echo $sentAt . "\n";
            try {
                // Upsert by twilio_sid or conversation_id when available
                $twilioSidKey = $m->sid ?? null;
                $conversationId = $m->sid ?? null; // Twilio messages may not provide a conversation id

                // Build payload
                // Determine contact_id by matching contacts.primary_no to the Twilio "to" number.
                // Try both the raw value and the value without a leading '+'.
                $toRaw = $m->to ?? null;
                $contactId = null;
                if (!empty($toRaw)) {
                    $normalized = ltrim($toRaw, '+');
                    try {
                        $found = Contacts::where('primary_no', $normalized)
                            ->orWhere('primary_no', $toRaw)
                            ->first();
                        if ($found) {
                            $contactId = $found->id;
                        }
                    } catch (\Exception $ex) {
                        // ignore lookup failure and leave contactId null
                    }
                }

                $data = [
                    'contact_id' => $contactId, // may be null
                    'to_number' => $toRaw,
                    'message_body' => $m->body ?? null,
                    'status' => $m->status ?? 'sent',
                    'twilio_sid' => $twilioSidKey,
                    'conversation_id' => $conversationId,
                ];
                if (!empty($sentAt)) {
                    // store Twilio's date_sent separately; keep created_at for local write time
                    $data['date_sent'] = $sentAt;
                }

                // Try to find existing record by twilio_sid first
                $existing = null;
                if (!empty($twilioSidKey)) {
                    $existing = \App\Models\OutboundMessage::where('twilio_sid', $twilioSidKey)->first();
                }

if ($existing) {
    // update non-authoritative fields
    $existing->to_number = $data['to_number'];
    $existing->message_body = $data['message_body'];
    $existing->status = $data['status'];
    // set contact_id if we resolved one and it's not already set
    if (empty($existing->contact_id) && !empty($data['contact_id'])) {
        $existing->contact_id = $data['contact_id'];
    }
    if (!empty($sentAt)) {
        $existing->date_sent = $data['date_sent'];
    }
    if (empty($existing->conversation_id) && !empty($conversationId)) {
        $existing->conversation_id = $conversationId;
    }
    $existing->save();
} else {
    // create new record
    $createData = $data;
                     if (empty($createData['date_sent'])) {
                         // preserve created_at but also ensure date_sent is set to now when Twilio didn't provide one
                         $createData['date_sent'] = now()->toDateTimeString();
                     }
                     \App\Models\OutboundMessage::create($createData);
                     $imported++;
                 }
            } catch (\Exception $e) {
                $errors[] = ['sid' => $m->sid ?? null, 'error' => $e->getMessage()];
                continue;
            }
        }

        return response()->json(['checked' => $checked, 'imported' => $imported, 'errors' => $errors]);
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
}
