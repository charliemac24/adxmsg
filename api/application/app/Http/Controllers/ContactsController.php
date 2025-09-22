<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\Contacts;
use App\Models\Groups;
use App\Models\AddressState;
use App\Models\ImportCsvLogger;
use App\Models\OptoutLogger;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Class ContactsController
 *
 * Controller for managing contacts using Eloquent.
 *
 * @package App\Http\Controllers
 */
class ContactsController extends Controller
{
    /**
     * Bulk delete contacts by IDs.
     *
     * @param \Illuminate\Http\Request $request
     * @return \Illuminate\Http\JsonResponse
     */
    public function bulkDelete(Request $request)
    {
        $validated = $request->validate([
            'ids' => 'required|array|min:1',
            'ids.*' => 'integer|exists:contacts,id',
        ]);

        // Ensure related unsubscribe_redirects are removed as well. Do in a transaction.
        DB::beginTransaction();
        try {
            DB::table('unsubscribe_redirects')->whereIn('contact_id', $validated['ids'])->delete();
            $deleted = Contacts::whereIn('id', $validated['ids'])->delete();
            DB::commit();
            return response()->json([
                'deleted_count' => $deleted,
                'message' => $deleted > 0 ? 'Contacts deleted successfully.' : 'No contacts deleted.',
            ]);
        } catch (\Exception $e) {
            DB::rollBack();
            return response()->json(['deleted_count' => 0, 'message' => 'Failed to delete contacts', 'error' => $e->getMessage()], 500);
        }
    }

    /**
     * Create a new contact.
     *
     * @param \Illuminate\Http\Request $request
     * @return \Illuminate\Http\JsonResponse
     */
    public function store(Request $request)
    {
        $validated = $request->validate([
            'first_name'    => 'required|string|max:255',
            'last_name'     => 'required|string|max:255',
            'address_state' => 'required|integer|exists:address_state,id',
            'primary_no'    => 'required|string|max:255',
            'email_add'     => 'required|email|max:255',
            'group_no'      => 'required|integer|exists:contact_groups,id',
            'is_subscribed' => 'boolean'
        ]);

        $contact = Contacts::create($validated);

        // Populate unsubscribe_link after creation (depends on the model id)
        try {
            // Get the full link from model helper (may include /public)
            $fullLink = $contact->unsubscribeLink();
            // Remove any '/public' path segment
            $targetUrl = preg_replace('#/public(/|$)#i', '/', $fullLink);

            // Use the contact's id as the token (string)
            $token = (string) $contact->id;

            // adjust token to meet fixed-length requirements for shortlink estimation
            $len = mb_strlen($token);
            if ($len === 1) {
                $token .= 'adx';
            } elseif ($len === 2) {
                $token .= 'ad';
            } elseif ($len === 3) {
                $token .= 'a';
            } // if 31, do nothing

            $now = now()->toDateTimeString();
            
            // Insert redirect record with token = contact id
            $redirectId = DB::table('unsubscribe_redirects')->insertGetId([
                'contact_id' => $contact->id,
                'target_url' => $targetUrl,
                'token' => $token,
                'created_at' => $now,
                'updated_at' => $now,
            ]);

            // Build public short link using token (contact id)
            $base = rtrim(Config::get('app.url', env('APP_URL', '')), '/');
            $short = $base . '/u/' . $token;
            // remove any '/public' segment if present and normalize slashes
            $short = preg_replace('#/public(/|$)#i', '/', $short);
            $short = rtrim($short, '/');

            $contact->unsubscribe_link = $short;
            $contact->save();
        } catch (\Exception $e) {
            // Non-fatal: return created contact even if link generation fails
        }

        return response()->json($contact, 201);
    }

    /**
     * Retrieve all contacts.
     *
     * @return \Illuminate\Http\JsonResponse
     */
    public function index()
    {
        $contacts = Contacts::with(['addressState', 'group'])->get();

        // Optionally, format the output to include the real names directly
        $contacts = $contacts->map(function ($contact) {
            return [
                'id' => $contact->id,
                'first_name' => $contact->first_name,
                'last_name' => $contact->last_name,
                'primary_no' => $contact->primary_no,
                'email_add' => $contact->email_add,
                'group_no' => $contact->group ? $contact->group->id : null,
                'address_state' => $contact->addressState ? $contact->addressState->id : null,
                'is_subscribed' => $contact->is_subscribed,
            ];
        });

        return response()->json($contacts);
    }

    /**
     * Retrieve a contact by ID.
     *
     * @param int $id
     * @return \Illuminate\Http\JsonResponse
     */
    public function show($id)
    {
        $contact = Contacts::find($id);
        if (!$contact) {
            return response()->json(['message' => 'Contact not found'], 404);
        }
        return response()->json($contact);
    }

    /**
     * Update a contact by ID.
     *
     * @param \Illuminate\Http\Request $request
     * @param int $id
     * @return \Illuminate\Http\JsonResponse
     */
    public function update(Request $request, $id)
    {
        $validated = $request->validate([
            'first_name'    => 'sometimes|required|string|max:255',
            'last_name'     => 'sometimes|required|string|max:255',
            'address_state' => 'sometimes|integer|exists:address_state,id',
            'primary_no'    => 'sometimes|required|string|max:255',
            'group_no'      => 'sometimes|integer|exists:contact_groups,id',
            'is_subscribed' => 'sometimes|boolean'
        ]);

        $contact = Contacts::find($id);
        if (!$contact) {
            return response()->json(['message' => 'Contact not found'], 404);
        }
        $contact->update($validated);
        return response()->json($contact);
    }

    /**
     * Delete a contact by ID.
     *
     * @param int $id
     * @return \Illuminate\Http\JsonResponse
     */
    public function destroy($id)
    {
        $contact = Contacts::find($id);
        if (!$contact) {
            return response()->json(['message' => 'Contact not found'], 404);
        }

        // Delete related unsubscribe redirect and contact inside a transaction
        DB::beginTransaction();
        try {
            DB::table('unsubscribe_redirects')->where('contact_id', $id)->delete();
            $contact->delete();
            DB::commit();
            return response()->json(['deleted' => true]);
        } catch (\Exception $e) {
            DB::rollBack();
            return response()->json(['deleted' => false, 'message' => 'Failed to delete contact', 'error' => $e->getMessage()], 500);
        }
    }

    /**
     * Retrieve contacts by address state.
     *
     * @param int $address_state
     * @return \Illuminate\Http\JsonResponse
     */
    public function getByAddressState($address_state)
    {
        $contacts = Contacts::where('address_state', $address_state)->get();
        return response()->json($contacts);
    }

    /**
     * Retrieve contacts by group.
     *
     * @param int $group_no
     * @return \Illuminate\Http\JsonResponse
     */
    public function getByGroup($group_no)
    {
        $contacts = Contacts::where('group_no', $group_no)->get();
        return response()->json($contacts);
    }

    /**
     * Import contacts from a CSV file.
     *
     * @param \Illuminate\Http\Request $request
     * @return \Illuminate\Http\JsonResponse
     */
    public function importCsv(Request $request)
    {
        // Allow large/long imports
        ini_set('max_execution_time', 600); // 10 minutes
        ini_set('memory_limit', '1024M');
        
        $request->validate([
            'csv_file' => 'required|file|mimes:csv,txt',
        ]);

        $file = $request->file('csv_file');
        $handle = fopen($file->getRealPath(), 'r');
        $header = fgetcsv($handle);

        $imported = 0;
        $skipped = 0;
        $errors = [];

        while (($row = fgetcsv($handle)) !== false) {
            $field = array_combine($header, $row);

            $data = [
                'first_name'  => $field['first_name'] ?? null,
                'last_name'   => $field['last_name'] ?? null,
                'primary_no'  => $field['phone'] ?? null,
                'email_add'   => $field['Email'] ?? null,
            ];

            /** Explicitly set group FOR NOW! */
            $group = 'ADX';
            $groupModel = Groups::where('group_name', $group)->first();

            /** Address State should be coming from the CSV */
            $addressState = $field['address_state'] ?? null;
            $addressStateModel = AddressState::where('state', $addressState)->first();

            /** Get the corresponding ID's from the database */
            $data['group_no'] = $groupModel ? $groupModel->id : null;
            $data['address_state'] = $addressStateModel ? $addressStateModel->id : null;

            // Skip if primary_no or address_state is empty or null
            if (empty($data['primary_no']) || empty($data['address_state'])) {
                $skipped++;
                continue;
            }

            // If primary_no already exists, update the record; otherwise, create new
            $existingContact = Contacts::where('primary_no', $data['primary_no'])->first();
            if ($existingContact) {
                $existingContact->update($data);
                $skipped++; // Optionally, you can use a separate counter for updated records
                // Ensure unsubscribe_link exists/updated after import update
                try {
                    $fullLink = $existingContact->unsubscribeLink();
                    $targetUrl = preg_replace('#/public(/|$)#i', '/', $fullLink);
                    $now = now()->toDateTimeString();

                    // Use contact id as token
                    $token = (string) $existingContact->id;

                    // Upsert redirect record for this contact: update if exists, insert otherwise
                    $existingRedirect = DB::table('unsubscribe_redirects')->where('contact_id', $existingContact->id)->first();
                    if ($existingRedirect) {
                        DB::table('unsubscribe_redirects')->where('id', $existingRedirect->id)
                            ->update(['target_url' => $targetUrl, 'token' => $token, 'updated_at' => $now]);
                    } else {
                        DB::table('unsubscribe_redirects')->insertGetId([
                            'contact_id' => $existingContact->id,
                            'target_url' => $targetUrl,
                            'token' => $token,
                            'created_at' => $now,
                            'updated_at' => $now,
                        ]);
                    }

                    $base = rtrim(Config::get('app.url', env('APP_URL', '')), '/');
                    $short = $base . '/u/' . $token;
                    // remove any '/public' segment if present and normalize slashes
                    $short = preg_replace('#/public(/|$)#i', '/', $short);
                    $short = rtrim($short, '/');
                    $existingContact->unsubscribe_link = $short;
                    $existingContact->save();
                } catch (\Exception $e) {
                    // ignore
                }

                continue;
            }

            $new = Contacts::create($data);
            // Populate unsubscribe_link for the newly created contact
            try {
                $fullLink = $new->unsubscribeLink();
                $targetUrl = preg_replace('#/public(/|$)#i', '/', $fullLink);
                $now = now()->toDateTimeString();

                // Use the newly created contact id as the token
                $token = (string) $new->id;
                // adjust token to meet fixed-length requirements for shortlink estimation
                $len = mb_strlen($token);
                if ($len === 1) {
                    $token .= 'adx';
                } elseif ($len === 2) {
                    $token .= 'ad';
                } elseif ($len === 3) {
                    $token .= 'a';
                } // if 31, do nothing

                DB::table('unsubscribe_redirects')->insertGetId([
                    'contact_id' => $new->id,
                    'target_url' => $targetUrl,
                    'token' => $token,
                    'created_at' => $now,
                    'updated_at' => $now,
                ]);
                $base = rtrim(Config::get('app.url', env('APP_URL', '')), '/');
                $short = $base . '/u/' . $token;
                // remove any '/public' segment if present and normalize slashes
                $short = preg_replace('#/public(/|$)#i', '/', $short);
                $short = rtrim($short, '/');
                $new->unsubscribe_link = $short;
                $new->save();
            } catch (\Exception $e) {
                // ignore
            }

            $imported++;
        }

        fclose($handle);

        ImportCsvLogger::create([
            'csv_file_name'    => $file->getClientOriginalName(),
            'records_imported' => $imported,
            'records_skipped'  => $skipped
        ]);

        // After import completes, generate unsubscribe shortlinks for all contacts.
        // Use try/catch to avoid failing the API response if the artisan command errors.
        try {
            Artisan::call('unsubscribe:generate-shortlinks');
        } catch (\Exception $e) {
            // optional: you can log the error here, but do not fail the import response
            // \Log::error('Failed to run unsubscribe:generate-shortlinks after CSV import: '.$e->getMessage());
        }

        return response()->json([
            'imported' => $imported,
            'skipped' => $skipped,
            'errors' => $errors,
        ]);
    }

    /**
     * Get the total number of contacts.
     *
     * @return \Illuminate\Http\JsonResponse
     */
    public function totalCount()
    {
        $count = Contacts::count();
        return response()->json(['total_contacts' => $count]);
    }

    /**
     * Get the total number of contacts who are unsubscribed (is_subscribed = 0).
     *
     * @return \Illuminate\Http\JsonResponse
     */
    public function totalUnsubscribed()
    {
        $count = Contacts::where('is_subscribed', 0)->count();
        return response()->json(['total_unsubscribed' => $count]);
    }

    /**
     * Unsubscribe a contact by ID and log the opt-out.
     *
     * @param int $id
     * @return \Illuminate\Http\JsonResponse
     */
    public function unsubscribe($id)
    {
        $contact = Contacts::find($id);
        if (!$contact) {
            return response()->json(['message' => 'Contact not found'], 404);
        }

        // Set subscription flag to false (0)
        $contact->is_subscribed = 0;
        $contact->save();

        // Log opt-out
        try {
            OptoutLogger::create([
                'contact_id' => $contact->id,
                'reason' => null,
                'created_at' => now()->toDateTimeString(),
            ]);
        } catch (\Exception $e) {
            // If logging fails, still return success but include a warning
            return response()->json(['message' => 'Unsubscribed, but failed to log opt-out', 'warning' => $e->getMessage()], 200);
        }

        return response()->json(['message' => 'Contact unsubscribed successfully'], 200);
    }

    /**
     * Generate unsubscribe HMAC signature for a contact ID using the application key.
     * Handles Laravel's "base64:..." APP_KEY format.
     *
     * @param int|string $contactId
     * @return string
     */
    private function unsubscribeSigFor($contactId)
    {
        $rawKey = Config::get('app.key') ?: env('APP_KEY');
        if (!$rawKey) {
            // Fallback to empty string to avoid warnings; this will produce a signature that won't match.
            $rawKey = '';
        }

        if (strpos($rawKey, 'base64:') === 0) {
            $key = base64_decode(substr($rawKey, 7));
        } else {
            $key = $rawKey;
        }

        return hash_hmac('sha256', (string) $contactId, $key);
    }

    /**
     * Public unsubscribe link handler. Validates signature and unsubscribes the contact.
     * URL format: /v1/unsubscribe/{id}/{sig}
     *
     * @param \Illuminate\Http\Request $request
     * @param int $id
     * @param string $sig
     * @return \Illuminate\Http\Response
     */
    public function publicUnsubscribe(Request $request, $id, $sig)
    {
    // Recreate expected HMAC using app key (handles base64: APP_KEY)
    $expected = $this->unsubscribeSigFor($id);

    if (!hash_equals($expected, (string) $sig)) {
            return response()->view('unsubscribe_confirmation', [
                'title' => 'Invalid link',
                'message' => 'The unsubscribe link is invalid or has been tampered with.'
            ], 400);
        }

        // Use existing unsubscribe logic
        $result = $this->unsubscribe($id);

        // Render a friendly HTML confirmation for public users
        if ($result instanceof \Illuminate\Http\JsonResponse) {
            $data = $result->getData(true);
            $message = $data['message'] ?? 'You have been unsubscribed.';
            return response()->view('unsubscribe_confirmation', [
                'title' => 'Unsubscribed',
                'message' => $message
            ], 200);
        }

        // Fallback
        return response()->view('unsubscribe_confirmation', [
            'title' => 'Unsubscribed',
            'message' => 'You have been unsubscribed.'
        ], 200);
    }

    /**
     * Get the history of imported CSV files.
     *
     * @return \Illuminate\Http\JsonResponse
     */
    public function importCsvHistory()
    {
        $history = ImportCsvLogger::orderBy('created_at', 'desc')
            ->get(['csv_file_name', 'records_imported', 'records_skipped', 'created_at']);

        return response()->json($history);
    }

    /**
     * Export contacts as CSV. Accepts query params to filter: group_no, address_state, is_subscribed (0/1), search
     */
    public function exportCsv(Request $request)
    {
        $query = Contacts::query();

        // support multi-select values for group_no and address_state (array or comma-separated)
        if ($request->filled('group_no')) {
            $groupParam = $request->get('group_no');
            if (is_array($groupParam)) {
                $query->whereIn('id', $groupParam);
            } else {
                $vals = explode(',', (string) $groupParam);
                $query->whereIn('id', array_filter($vals, fn($v) => $v !== ''));
            }
        }

        if ($request->filled('address_state')) {
            $stateParam = $request->get('address_state');
            if (is_array($stateParam)) {
                $query->whereIn('id', $stateParam);
            } else {
                $vals = explode(',', (string) $stateParam);
                $query->whereIn('id', array_filter($vals, fn($v) => $v !== ''));
            }
        }

        // status parameter: accept 'all'|'subscribed'|'unsubscribed' or numeric is_subscribed
        if ($request->filled('status')) {
            $status = strtolower($request->get('status'));
            if ($status === 'subscribed') {
                $query->where('is_subscribed', 1);
            } elseif ($status === 'unsubscribed') {
                $query->where('is_subscribed', 0);
            }
        } elseif ($request->filled('is_subscribed')) {
            // numeric override
            $query->where('is_subscribed', $request->get('is_subscribed'));
        }
        if ($request->has('search') && trim($request->get('search')) !== '') {
            $s = trim($request->get('search'));
            $query->where(function($q) use ($s) {
                $q->whereRaw("CONCAT(IFNULL(first_name,''),' ',IFNULL(last_name,'')) LIKE ?", ["%{$s}%"])
                  ->orWhere('primary_no', 'like', "%{$s}%")
                  ->orWhere('email_add', 'like', "%{$s}%");
            });
        }

        // eager-load group and address state to get their names
        $contacts = $query->with(['group', 'addressState'])->orderBy('id', 'desc')->get();

        $headers = [
            'Content-Type' => 'text/csv',
            'Content-Disposition' => 'attachment; filename="contacts_export.csv"'
        ];

        $columns = ['id','first_name','last_name','email_add','mobile','group','address','is_subscribed'];

        $callback = function() use ($contacts, $columns) {
            $f = fopen('php://output', 'w');
            fputcsv($f, $columns);
            foreach ($contacts as $c) {
                // map fields to desired output
                $groupName = ($c->group && isset($c->group->group_name)) ? $c->group->group_name : '';
                $addressName = ($c->addressState && isset($c->addressState->state)) ? $c->addressState->state : '';
                $mobile = $c->primary_no ?? ($c->mobile ?? '');
                $isSubscribed = (isset($c->is_subscribed) && intval($c->is_subscribed) === 1) ? 'yes' : 'no';

                $row = [
                    $c->id ?? '',
                    $c->first_name ?? '',
                    $c->last_name ?? '',
                    $c->email_add ?? '',
                    $mobile,
                    $groupName,
                    $addressName,
                    $isSubscribed
                ];

                fputcsv($f, $row);
            }
            fclose($f);
        };

        return response()->stream($callback, 200, $headers);
    }

    /**
     * Return a preview count of contacts matching export filters.
     * Accepts same params as export: group_no (array or csv), address_state (array or csv), status (all|subscribed|unsubscribed)
     */
    public function exportPreview(Request $request)
    {
        $query = Contacts::query();

        if ($request->filled('group_no')) {
            $groupParam = $request->get('group_no');
            if (is_array($groupParam)) {
                $query->whereIn('group_no', $groupParam);
            } else {
                $vals = explode(',', (string) $groupParam);
                $query->whereIn('group_no', array_filter($vals, fn($v) => $v !== ''));
            }
        }

        if ($request->filled('address_state')) {
            $stateParam = $request->get('address_state');
            if (is_array($stateParam)) {
                $query->whereIn('address_state', $stateParam);
            } else {
                $vals = explode(',', (string) $stateParam);
                $query->whereIn('address_state', array_filter($vals, fn($v) => $v !== ''));
            }
        }

        if ($request->filled('status')) {
            $status = strtolower($request->get('status'));
            if ($status === 'subscribed') {
                $query->where('is_subscribed', 1);
            } elseif ($status === 'unsubscribed') {
                $query->where('is_subscribed', 0);
            }
        }

        $count = $query->count();
        return response()->json(['count' => $count]);
    }

    /**
     * Get the number of contacts for each group.
     *
     * @return \Illuminate\Http\JsonResponse
     */
    public function countByGroup()
    {
        $counts = Contacts::select('group_no')
            ->selectRaw('COUNT(*) as total')
            ->groupBy('group_no')
            ->get();

        return response()->json($counts);
    }

    /**
     * Get the number of contacts for each address state.
     *
     * @return \Illuminate\Http\JsonResponse
     */
    public function countByState()
    {
        $counts = Contacts::select('address_state')
            ->selectRaw('COUNT(*) as total')
            ->groupBy('address_state')
            ->get();

        return response()->json($counts);
    }

    /**
     * Bulk assign contacts to a group.
     *
     * @param \Illuminate\Http\Request $request
     * @return \Illuminate\Http\JsonResponse
     */
    public function bulkAssignGroup(Request $request)
    {
        $validated = $request->validate([
            'ids' => 'required|array|min:1',
            'ids.*' => 'integer|exists:contacts,id',
            'group_no' => 'required|integer|exists:contact_groups,id',
        ]);

        $updated = Contacts::whereIn('id', $validated['ids'])
            ->update(['group_no' => $validated['group_no']]);

        return response()->json([
            'updated_count' => $updated,
            'message' => $updated > 0 ? 'Contacts assigned to group successfully.' : 'No contacts updated.',
        ]);
    }

    /**
     * Bulk assign contacts to an address state.
     *
     * @param \Illuminate\Http\Request $request
     * @return \Illuminate\Http\JsonResponse
     */
    public function bulkAssignState(Request $request)
    {
        $validated = $request->validate([
            'ids' => 'required|array|min:1',
            'ids.*' => 'integer|exists:contacts,id',
            'address_state' => 'required|integer|exists:address_state,id',
        ]);

        $updated = Contacts::whereIn('id', $validated['ids'])
            ->update(['address_state' => $validated['address_state']]);

        return response()->json([
            'updated_count' => $updated,
            'message' => $updated > 0 ? 'Contacts assigned to address state successfully.' : 'No contacts updated.',
        ]);
    }

    /**
     * Bulk unsubscribe contacts (mark is_subscribed = 0) and log opt-outs.
     *
     * @param \Illuminate\Http\Request $request
     * @return \Illuminate\Http\JsonResponse
     */
    public function bulkUnsubscribe(Request $request)
    {
        $validated = $request->validate([
            'ids' => 'required|array|min:1',
            'ids.*' => 'integer|exists:contacts,id',
        ]);

        $ids = $validated['ids'];

        // Update subscription flag
        $updated = Contacts::whereIn('id', $ids)
            ->update(['is_subscribed' => 0]);

        // Attempt to log opt-outs (non-fatal)
        try {
            $now = now()->toDateTimeString();
            $rows = array_map(function ($id) use ($now) {
                return [
                    'contact_id' => $id,
                    'reason' => null,
                    'created_at' => $now,
                ];
            }, $ids);
            if (!empty($rows)) {
                OptoutLogger::insert($rows);
            }
        } catch (\Exception $e) {
            // Swallow logging errors; return success for the unsubscribe update
        }

        return response()->json([
            'updated_count' => $updated,
            'message' => $updated > 0 ? 'Contacts unsubscribed successfully.' : 'No contacts updated.',
        ]);
    }

    /**
     * Bulk resubscribe contacts (mark is_subscribed = 1) and optionally log opt-ins.
     *
     * @param \Illuminate\Http\Request $request
     * @return \Illuminate\Http\JsonResponse
     */
    public function bulkResubscribe(Request $request)
    {
        $validated = $request->validate([
            'ids' => 'required|array|min:1',
            'ids.*' => 'integer|exists:contacts,id',
        ]);

        $ids = $validated['ids'];

        // Update subscription flag
        $updated = Contacts::whereIn('id', $ids)
            ->update(['is_subscribed' => 1]);

        // Optionally log opt-ins (non-fatal)
        try {
            $now = now()->toDateTimeString();
            $rows = array_map(function ($id) use ($now) {
                return [
                    'contact_id' => $id,
                    'reason' => null,
                    'created_at' => $now,
                ];
            }, $ids);
            // There's OptinLogger model/controller but to keep parity with unsubscribe logs,
            // only insert if the table exists. Use try/catch to avoid hard dependency.
            if (!empty($rows)) {
                \App\Models\OptinLogger::insert($rows);
            }
        } catch (\Exception $e) {
            // Swallow logging errors
        }

        return response()->json([
            'updated_count' => $updated,
            'message' => $updated > 0 ? 'Contacts resubscribed successfully.' : 'No contacts updated.',
        ]);
    }
}
