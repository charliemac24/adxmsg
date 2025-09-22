<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use App\Models\MailchimpContact;

class MailchimpController extends Controller
{
    // Sync audience members from Mailchimp into mailchimp_contacts table
    public function syncAudience(Request $request, $audienceId)
    {
        ini_set('max_execution_time', 600); // 10 minutes
        ini_set('memory_limit', '1024M');

        $apiKey = env('MAILCHIMP_API_KEY');
        $server = env('MAILCHIMP_SERVER_PREFIX'); // e.g. us19
        if (!$apiKey || !$server) {
            return response()->json(['status' => 'error', 'message' => 'Mailchimp API credentials not configured'], 500);
        }

        try {
            $base = "https://{$server}.api.mailchimp.com/3.0";
            $url = "$base/lists/{$audienceId}/members";
            // Use smaller pages and increased timeouts/retries to improve resilience for large audiences
            $perPage = 200; // reduced page size to lower payload and processing time
            $totalSynced = 0;
            $now = now();
            $maxRetries = 5; // allow more retry attempts
            $httpTimeout = 90; // seconds for HTTP requests (increased)

            // First request to determine total_items
            $first = Http::withBasicAuth('anystring', $apiKey)->timeout($httpTimeout)->get($url, ['count' => $perPage, 'offset' => 0]);
            if (!$first->ok()) {
                Log::error('mailchimp sync failed on first page', ['status' => $first->status(), 'body' => $first->body()]);
                return response()->json(['status' => 'error', 'message' => 'Mailchimp API error on first page', 'details' => $first->body()], 500);
            }

            $fdata = $first->json();
            $totalItems = isset($fdata['total_items']) ? intval($fdata['total_items']) : null;
            $pages = $totalItems ? (int) ceil($totalItems / $perPage) : 1;

            // process first page members
            $members = $fdata['members'] ?? [];
            foreach ($members as $m) {
                $email = $m['email_address'] ?? null;
                $mcid = $m['id'] ?? null;
                $fname = $m['merge_fields']['FNAME'] ?? null;
                $lname = $m['merge_fields']['LNAME'] ?? null;
                // phone: try common explicit keys then scan merge_fields for any key containing 'mobile' or 'phone'
                $phone = null;
                if (!empty($m['merge_fields']) && is_array($m['merge_fields'])) {
                    $mf = $m['merge_fields'];
                    $phone = $mf['PHONE'] ?? $mf['MOBILE'] ?? $mf['MOBILE_NUMBER'] ?? $mf['PHONE_NUMBER'] ?? null;
                    if (!$phone) {
                        foreach ($mf as $k => $v) {
                            if (stripos($k, 'mobile') !== false || stripos($k, 'phone') !== false) { $phone = $v; break; }
                        }
                    }
                }
                // Mailchimp audience may store a state field in merge_fields; try common keys
                $state = $m['merge_fields']['STATE'] ?? ($m['merge_fields']['STATE_CODE'] ?? ($m['merge_fields']['STATE_PROVINCE'] ?? null));
                // Business fields - prefer merge_fields company-like keys; fallback: scan for keys with company/business/org
                $businessName = null;
                if (!empty($m['merge_fields']) && is_array($m['merge_fields'])) {
                    $mf = $m['merge_fields'];
                    // Common business-name keys including Mailchimp merge tags BNAME or MERGEn
                    $businessName = $mf['BNAME'] ?? $mf['BNAME_NAME'] ?? $mf['COMPANY'] ?? $mf['COMPANY_NAME'] ?? $mf['BUSINESSNAME'] ?? $mf['BUSINESS_NAME'] ?? $mf['ORG'] ?? $mf['ORGNAME'] ?? null;
                    // specific MERGE tag fallback (some exports use MERGE5 etc)
                    if (!$businessName && isset($mf['MERGE5'])) $businessName = $mf['MERGE5'];
                    if (!$businessName) {
                        foreach ($mf as $k => $v) {
                            if (preg_match('/\b(bname|company|business|org|organisation)\b/i', $k) || preg_match('/^MERGE\d+$/i', $k) && is_string($v) && strlen(trim($v))>0) {
                                // prefer explicit company-like keys but accept MERGEn if it looks like text
                                if (preg_match('/\b(bname|company|business|org|organisation)\b/i', $k)) { $businessName = $v; break; }
                                if (!$businessName && preg_match('/^MERGE\d+$/i', $k) && is_string($v) && strlen(trim($v))>0) { $businessName = $v; break; }
                            }
                        }
                    }
                }
                // fallback: top-level keys that might contain company/business
                if (!$businessName) {
                    $businessName = $m['company'] ?? $m['company_name'] ?? $m['business'] ?? $m['business_name'] ?? null;
                    if (!$businessName) {
                        foreach ($m as $k => $v) {
                            if (is_string($k) && preg_match('/company|business|org|organisation/i', $k) && is_string($v) && !empty($v)) { $businessName = $v; break; }
                        }
                    }
                }
                // Business address: Mailchimp often stores this as a merge field of type 'address'
                $businessAddress = null;
                if (!empty($m['merge_fields']['ADDRESS']) && is_array($m['merge_fields']['ADDRESS'])) {
                    $addr = $m['merge_fields']['ADDRESS'];
                    // Common keys: addr1, addr2, city, state, zip, country
                    $parts = [];
                    if (!empty($addr['addr1'])) $parts[] = $addr['addr1'];
                    if (!empty($addr['addr2'])) $parts[] = $addr['addr2'];
                    if (!empty($addr['city'])) $parts[] = $addr['city'];
                    if (!empty($addr['state'])) $parts[] = $addr['state'];
                    if (!empty($addr['zip'])) $parts[] = $addr['zip'];
                    if (!empty($addr['country'])) $parts[] = $addr['country'];
                    $businessAddress = implode(', ', $parts);
                } elseif (!empty($m['merge_fields']['ADDRESS1']) || !empty($m['merge_fields']['ADDRESS_LINE1'])) {
                    // fallback string fields
                    $businessAddress = ($m['merge_fields']['ADDRESS1'] ?? $m['merge_fields']['ADDRESS_LINE1'] ?? null);
                } elseif (!empty($m['merge_fields']['MERGE3'])) {
                    // MAILCHIMP MERGE tag for address sometimes appears as MERGE3
                    $addr = $m['merge_fields']['MERGE3'];
                    if (is_array($addr)) {
                        $parts = [];
                        if (!empty($addr['addr1'])) $parts[] = $addr['addr1'];
                        if (!empty($addr['addr2'])) $parts[] = $addr['addr2'];
                        if (!empty($addr['city'])) $parts[] = $addr['city'];
                        if (!empty($addr['state'])) $parts[] = $addr['state'];
                        if (!empty($addr['zip'])) $parts[] = $addr['zip'];
                        if (!empty($addr['country'])) $parts[] = $addr['country'];
                        $businessAddress = implode(', ', $parts);
                    } else {
                        $businessAddress = (string)$addr;
                    }
                } elseif (!empty($m['location']) && is_array($m['location'])) {
                    // older payloads may include a location block
                    $businessAddress = implode(', ', array_filter([$m['location']['address'] ?? null, $m['location']['city'] ?? null, $m['location']['state'] ?? null, $m['location']['country'] ?? null]));
                } else {
                    // try to detect any other merge_field that appears to be an address
                    if (!empty($m['merge_fields']) && is_array($m['merge_fields'])) {
                        foreach ($m['merge_fields'] as $k => $v) {
                            if (stripos($k, 'address') !== false && !empty($v)) {
                                if (is_array($v)) {
                                    $parts = [];
                                    if (!empty($v['addr1'])) $parts[] = $v['addr1'];
                                    if (!empty($v['addr2'])) $parts[] = $v['addr2'];
                                    if (!empty($v['city'])) $parts[] = $v['city'];
                                    if (!empty($v['state'])) $parts[] = $v['state'];
                                    if (!empty($v['zip'])) $parts[] = $v['zip'];
                                    if (!empty($v['country'])) $parts[] = $v['country'];
                                    $businessAddress = implode(', ', $parts);
                                } else {
                                    $businessAddress = (string)$v;
                                }
                                break;
                            }
                        }
                    }
                }
                // tags can be provided as an array of tag objects or strings
                $tags = null;
                if (!empty($m['tags'])) {
                    if (is_array($m['tags'])) {
                        $tags = implode(',', array_map(function ($t) { return is_array($t) && isset($t['name']) ? $t['name'] : (string)$t; }, $m['tags']));
                    } else {
                        $tags = (string)$m['tags'];
                    }
                }

                // If still no businessName or businessAddress, log the merge_fields keys to help debugging
                if (empty($businessName) || empty($businessAddress)) {
                    try {
                        $mfk = array_keys($m['merge_fields'] ?? []);
                        Log::info('mailchimp sync missing business fields', ['audience'=>$audienceId, 'mailchimp_id'=>$mcid, 'merge_field_keys' => array_slice($mfk,0,20)]);
                    } catch (\Exception $e) { /* ignore logging errors */ }
                }

                MailchimpContact::updateOrCreate(
                    ['mailchimp_id' => $mcid, 'audience_id' => (string)$audienceId],
                    ['email' => $email, 'first_name' => $fname, 'last_name' => $lname, 'phone' => $phone, 'state' => $state, 'business_name' => $businessName, 'business_address' => $businessAddress, 'tags' => $tags, 'raw' => $m, 'synced_at' => $now]
                );
                $totalSynced++;
            }

            // iterate remaining pages deterministically with retries
            for ($i = 1; $i < $pages; $i++) {
                $offset = $i * $perPage;
                Log::info('mailchimp sync fetching page', ['audience' => $audienceId, 'page' => $i + 1, 'offset' => $offset]);
                $attempt = 0;
                $members = [];
                while ($attempt < $maxRetries) {
                    $attempt++;
                    try {
                        $res = Http::withBasicAuth('anystring', $apiKey)->timeout($httpTimeout)->get($url, ['count' => $perPage, 'offset' => $offset]);
                        if (!$res->ok()) {
                            Log::warning('mailchimp page fetch non-ok', ['audience' => $audienceId, 'page' => $i + 1, 'status' => $res->status()]);
                            // exponential backoff before retrying
                            sleep((int) pow(2, max(1, $attempt - 1)));
                            continue;
                        }
                        $data = $res->json();
                        $members = $data['members'] ?? [];
                        break;
                    } catch (\Exception $e) {
                        Log::warning('mailchimp page fetch exception', ['audience' => $audienceId, 'page' => $i + 1, 'attempt' => $attempt, 'error' => $e->getMessage()]);
                        sleep($attempt);
                        continue;
                    }
                }

                if (empty($members)) {
                    Log::warning('mailchimp sync empty members for page, aborting', ['audience' => $audienceId, 'page' => $i + 1]);
                    break;
                }

                foreach ($members as $m) {
                    $email = $m['email_address'] ?? null;
                    $mcid = $m['id'] ?? null;
                    $fname = $m['merge_fields']['FNAME'] ?? null;
                    $lname = $m['merge_fields']['LNAME'] ?? null;
                    // phone extraction
                    $phone = null;
                    if (!empty($m['merge_fields']) && is_array($m['merge_fields'])) {
                        $mf = $m['merge_fields'];
                        $phone = $mf['PHONE'] ?? $mf['MOBILE'] ?? $mf['MOBILE_NUMBER'] ?? $mf['PHONE_NUMBER'] ?? null;
                        if (!$phone) {
                            foreach ($mf as $k => $v) {
                                if (stripos($k, 'mobile') !== false || stripos($k, 'phone') !== false) { $phone = $v; break; }
                            }
                        }
                    }
                    $state = $m['merge_fields']['STATE'] ?? ($m['merge_fields']['STATE_CODE'] ?? ($m['merge_fields']['STATE_PROVINCE'] ?? null));
                    // business name
                    $businessName = null;
                    if (!empty($m['merge_fields']) && is_array($m['merge_fields'])) {
                        $mf = $m['merge_fields'];
                        $businessName = $mf['BNAME'] ?? $mf['BNAME_NAME'] ?? $mf['COMPANY'] ?? $mf['COMPANY_NAME'] ?? $mf['BUSINESSNAME'] ?? $mf['BUSINESS_NAME'] ?? $mf['ORG'] ?? $mf['ORGNAME'] ?? null;
                        if (!$businessName && isset($mf['MERGE5'])) $businessName = $mf['MERGE5'];
                        if (!$businessName) {
                            foreach ($mf as $k => $v) {
                                if (preg_match('/\b(bname|company|business|org|organisation)\b/i', $k) || preg_match('/^MERGE\d+$/i', $k) && is_string($v) && strlen(trim($v))>0) {
                                    if (preg_match('/\b(bname|company|business|org|organisation)\b/i', $k)) { $businessName = $v; break; }
                                    if (!$businessName && preg_match('/^MERGE\d+$/i', $k) && is_string($v) && strlen(trim($v))>0) { $businessName = $v; break; }
                                }
                            }
                        }
                    }
                    // fallback to top-level fields
                    if (!$businessName) {
                        $businessName = $m['company'] ?? $m['company_name'] ?? $m['business'] ?? $m['business_name'] ?? null;
                        if (!$businessName) {
                            foreach ($m as $k => $v) {
                                if (is_string($k) && preg_match('/company|business|org|organisation/i', $k) && is_string($v) && !empty($v)) { $businessName = $v; break; }
                            }
                        }
                    }
                    $businessAddress = null;
                    if (!empty($m['merge_fields']['ADDRESS']) && is_array($m['merge_fields']['ADDRESS'])) {
                        $addr = $m['merge_fields']['ADDRESS'];
                        $parts = [];
                        if (!empty($addr['addr1'])) $parts[] = $addr['addr1'];
                        if (!empty($addr['addr2'])) $parts[] = $addr['addr2'];
                        if (!empty($addr['city'])) $parts[] = $addr['city'];
                        if (!empty($addr['state'])) $parts[] = $addr['state'];
                        if (!empty($addr['zip'])) $parts[] = $addr['zip'];
                        if (!empty($addr['country'])) $parts[] = $addr['country'];
                        $businessAddress = implode(', ', $parts);
                    } elseif (!empty($m['merge_fields']['ADDRESS1']) || !empty($m['merge_fields']['ADDRESS_LINE1'])) {
                        $businessAddress = ($m['merge_fields']['ADDRESS1'] ?? $m['merge_fields']['ADDRESS_LINE1'] ?? null);
                    } elseif (!empty($m['merge_fields']['MERGE3'])) {
                        $addr = $m['merge_fields']['MERGE3'];
                        if (is_array($addr)) {
                            $parts = [];
                            if (!empty($addr['addr1'])) $parts[] = $addr['addr1'];
                            if (!empty($addr['addr2'])) $parts[] = $addr['addr2'];
                            if (!empty($addr['city'])) $parts[] = $addr['city'];
                            if (!empty($addr['state'])) $parts[] = $addr['state'];
                            if (!empty($addr['zip'])) $parts[] = $addr['zip'];
                            if (!empty($addr['country'])) $parts[] = $addr['country'];
                            $businessAddress = implode(', ', $parts);
                        } else {
                            $businessAddress = (string)$addr;
                        }
                    } elseif (!empty($m['location']) && is_array($m['location'])) {
                        $businessAddress = implode(', ', array_filter([$m['location']['address'] ?? null, $m['location']['city'] ?? null, $m['location']['state'] ?? null, $m['location']['country'] ?? null]));
                    } else {
                        if (!empty($m['merge_fields']) && is_array($m['merge_fields'])) {
                            foreach ($m['merge_fields'] as $k => $v) {
                                if (stripos($k, 'address') !== false && !empty($v)) {
                                    if (is_array($v)) {
                                        $parts = [];
                                        if (!empty($v['addr1'])) $parts[] = $v['addr1'];
                                        if (!empty($v['addr2'])) $parts[] = $v['addr2'];
                                        if (!empty($v['city'])) $parts[] = $v['city'];
                                        if (!empty($v['state'])) $parts[] = $v['state'];
                                        if (!empty($v['zip'])) $parts[] = $v['zip'];
                                        if (!empty($v['country'])) $parts[] = $v['country'];
                                        $businessAddress = implode(', ', $parts);
                                    } else {
                                        $businessAddress = (string)$v;
                                    }
                                    break;
                                }
                            }
                        }
                    }
                    $tags = null;
                    if (!empty($m['tags'])) {
                        if (is_array($m['tags'])) {
                            $tags = implode(',', array_map(function ($t) { return is_array($t) && isset($t['name']) ? $t['name'] : (string)$t; }, $m['tags']));
                        } else {
                            $tags = (string)$m['tags'];
                        }
                    }

                    MailchimpContact::updateOrCreate(
                        ['mailchimp_id' => $mcid, 'audience_id' => (string)$audienceId],
                        ['email' => $email, 'first_name' => $fname, 'last_name' => $lname, 'phone' => $phone, 'state' => $state, 'business_name' => $businessName, 'business_address' => $businessAddress, 'tags' => $tags, 'raw' => $m, 'synced_at' => $now]
                    );
                    $totalSynced++;
                }
                // be polite
                usleep(150000);
            }

            return response()->json(['status' => 'ok', 'synced' => $totalSynced, 'total_items' => $totalItems]);
        } catch (\Exception $e) {
            Log::error('mailchimp sync exception', ['message' => $e->getMessage()]);
            return response()->json(['status' => 'error', 'message' => $e->getMessage()], 500);
        }
    }

    // Return paginated mailchimp contacts. Optional audienceId filters by audience.
    public function contacts(Request $request, $audienceId = null)
    {
        $perPage = intval($request->query('per_page', 25));
        $page = intval($request->query('page', 1));

        $query = MailchimpContact::query()->orderBy('id', 'desc');
        if ($audienceId) {
            $query->where('audience_id', (string) $audienceId);
        }

        $p = $query->paginate($perPage, ['*'], 'page', $page);

        return response()->json([
            'status' => 'ok',
            'data' => $p->items(),
            'meta' => [
                'total' => $p->total(),
                'per_page' => $p->perPage(),
                'current_page' => $p->currentPage(),
                'last_page' => $p->lastPage(),
            ],
        ]);
    }

    // Export mailchimp contacts for an audience as CSV
    public function exportAudience(Request $request, $audienceId = null)
    {
        $query = MailchimpContact::query();
        if ($audienceId) $query->where('audience_id', (string)$audienceId);

        $contacts = $query->orderBy('id', 'desc')->get();

        $headers = [
            'Content-Type' => 'text/csv',
            'Content-Disposition' => 'attachment; filename="mailchimp_contacts_export.csv"',
        ];

        $columns = ['email','first_name','last_name','phone','state','business_name','business_address','tags','synced_at','audience_id'];

        $callback = function() use ($contacts, $columns) {
            $f = fopen('php://output', 'w');
            fputcsv($f, $columns);
            foreach ($contacts as $c) {
                $row = [];
                foreach ($columns as $col) {
                    $val = $c->{$col} ?? '';
                    if (is_array($val)) $val = implode(',', $val);
                    $row[] = $val;
                }
                fputcsv($f, $row);
            }
            fclose($f);
        };

        return response()->stream($callback, 200, $headers);
    }

    // Deduplicate contacts by email: keep the most recently synced record and delete others
    public function dedupeAudience(Request $request, $audienceId = null)
    {
        $query = MailchimpContact::query();
        if ($audienceId) $query->where('audience_id', (string)$audienceId);

        // Identify duplicate emails
        $dupes = $query->select('email')
            ->groupBy('email')
            ->havingRaw('COUNT(*) > 1')
            ->pluck('email');

        $deleted = 0;
        $kept = 0;

        foreach ($dupes as $email) {
            $rows = MailchimpContact::where('email', $email)
                ->when($audienceId, function($q) use ($audienceId) { return $q->where('audience_id', (string)$audienceId); })
                ->orderBy('synced_at', 'desc')
                ->orderBy('id', 'desc')
                ->get();

            if ($rows->count() <= 1) continue;
            // Keep first, delete the rest
            $keep = $rows->shift();
            $kept++;
            $idsToDelete = $rows->pluck('id')->all();
            $deleted += MailchimpContact::whereIn('id', $idsToDelete)->delete();
        }

        return response()->json(['status' => 'ok', 'deleted' => $deleted, 'kept' => $kept]);
    }

    // Accept a multipart/form-data upload (CSV) and import rows into mailchimp_contacts for given audience
    public function importCsv(Request $request, $audienceId = null)
    {

        ini_set('max_execution_time', 600); // 10 minutes
        ini_set('memory_limit', '1024M');
    // Hardcoded audience id for import
    $audienceId = '1590941';
    $from = 'hardcoded';
    Log::info('importCsv audience id hardcoded', ['audience_id' => $audienceId]);
        
        if (!$request->hasFile('file')) {
            return response()->json(['status' => 'error', 'message' => 'No file uploaded'], 400);
        }

        $file = $request->file('file');
        if (!$file->isValid()) {
            return response()->json(['status' => 'error', 'message' => 'Invalid file upload'], 400);
        }

        $path = $file->getRealPath();
        $handle = fopen($path, 'r');
        if ($handle === false) {
            return response()->json(['status' => 'error', 'message' => 'Unable to read file'], 500);
        }

        // Read first non-empty line to detect delimiter and header
        $firstLine = null;
        while (($l = fgets($handle)) !== false) {
            $trim = trim($l);
            if ($trim !== '') { $firstLine = $l; break; }
        }
        if ($firstLine === null) {
            fclose($handle);
            return response()->json(['status' => 'error', 'message' => 'CSV file is empty'], 400);
        }

        // detect delimiter by counting occurrences on the first line
        $delims = [',', ';', "\t", '|'];
        $best = ',';
        $bestCount = -1;
        foreach ($delims as $d) {
            $c = substr_count($firstLine, $d);
            if ($c > $bestCount) { $bestCount = $c; $best = $d; }
        }
        $delimiter = $best;

        // Rewind and use fgetcsv with detected delimiter. Parse header with BOM stripping and trimming.
        rewind($handle);
        $header = null;
        $count = 0;
    $mc_upserted = 0; // count of successful upserts to Mailchimp
    $mc_errors = []; // collect sample errors from Mailchimp API
    // Quick check: verify Mailchimp list exists and credentials/datacenter are correct
    $apiKey = env('MAILCHIMP_API_KEY');
    $server = env('MAILCHIMP_SERVER_PREFIX');
    if ($apiKey && $server) {
        try {
            $base = "https://{$server}.api.mailchimp.com/3.0";
            $listCheck = Http::withBasicAuth('anystring', $apiKey)->timeout(30)->get("{$base}/lists/{$audienceId}");
            if (!$listCheck->ok()) {
                $lcBody = null;
                try { $lcBody = $listCheck->body(); } catch (\Exception $e) { $lcBody = null; }
                Log::warning('mailchimp list check failed', ['audience' => $audienceId, 'status' => $listCheck->status(), 'body' => $lcBody]);
                try {
                    \App\Models\MailchimpImportLog::create([
                        'filename' => $file->getClientOriginalName(),
                        'audience_id' => (string)$audienceId,
                        'imported_count' => 0,
                        'raw_response' => ['error' => 'list_check_failed', 'status' => $listCheck->status(), 'body' => $lcBody],
                    ]);
                } catch (\Exception $e) { /* ignore logging failures */ }
                return response()->json(['status' => 'error', 'message' => 'Mailchimp list not found or API credentials/datacenter invalid', 'details' => $lcBody], 500);
            }
        } catch (\Exception $e) {
            Log::warning('mailchimp list check exception', ['audience' => $audienceId, 'error' => $e->getMessage()]);
            // don't abort here; we'll surface per-upsert errors below if anything else fails
        }
    }
        $skipped = 0;
        $skippedSamples = [];
        $now = now();
        while (($row = fgetcsv($handle, 0, $delimiter)) !== false) {
            // skip empty rows
            $allEmpty = true;
            foreach ($row as $cell) { if (trim($cell) !== '') { $allEmpty = false; break; } }
            if ($allEmpty) continue;

            if (!$header) {
                // strip UTF-8 BOM from first header cell if present
                $row[0] = preg_replace('/^\xEF\xBB\xBF/', '', $row[0]);
                $header = array_map(function ($h) { return trim((string)$h); }, $row);
                continue;
            }

            // if header/row column count mismatch, try to skip and record sample for debugging
            if (count($header) !== count($row)) {
                $skipped++;
                if (count($skippedSamples) < 5) $skippedSamples[] = $row;
                continue;
            }

            $data = array_combine($header, $row);
            if (!$data) { $skipped++; if (count($skippedSamples) < 5) $skippedSamples[] = $row; continue; }

            // find email-like column flexibly (email, email_address, email address, etc.)
            $email = null;
            foreach ($data as $k => $v) {
                $norm = preg_replace('/[^a-z0-9]/', '', strtolower($k));
                if (strpos($norm, 'email') !== false) { $email = trim((string)$v); break; }
            }

            // fallback common header names
            if (!$email) {
                $email = $data['email'] ?? ($data['Email'] ?? ($data['email_address'] ?? ($data['Email Address'] ?? null)));
            }

            $first = null; $last = null; $phone = null; $state = null; $businessName = null; $businessAddress = null; $tags = null;
            foreach ($data as $k => $v) {
                $kn = preg_replace('/[^a-z0-9]/', '', strtolower($k));
                $val = trim((string)$v);
                if (!$first && (strpos($kn, 'fname') !== false || strpos($kn, 'firstname') !== false || strpos($kn, 'first') !== false)) $first = $val;
                if (!$last && (strpos($kn, 'lname') !== false || strpos($kn, 'lastname') !== false || strpos($kn, 'last') !== false)) $last = $val;
                if (!$phone && (strpos($kn, 'phone') !== false || strpos($kn, 'mobile') !== false)) $phone = $val;
                if (!$state && strpos($kn, 'state') !== false) $state = $val;
                if (!$businessName && (strpos($kn, 'company') !== false || strpos($kn, 'business') !== false || strpos($kn, 'org') !== false || strpos($kn, 'bname') !== false)) $businessName = $val;
                if (!$businessAddress && strpos($kn, 'address') !== false) $businessAddress = $val;
                if (!$tags && strpos($kn, 'tag') !== false) $tags = $val;
            }

            if (!$email) { $skipped++; if (count($skippedSamples) < 5) $skippedSamples[] = $data; continue; }

            try {
                \App\Models\MailchimpContact::updateOrCreate(
                    ['mailchimp_id' => null, 'audience_id' => (string)$audienceId, 'email' => $email],
                    ['email' => $email, 'first_name' => $first, 'last_name' => $last, 'phone' => $phone, 'state' => $state, 'business_name' => $businessName, 'business_address' => $businessAddress, 'tags' => $tags, 'raw' => $data, 'synced_at' => $now]
                );
                $count++;
                // Attempt to upsert to Mailchimp API for this audience
                $apiKey = env('MAILCHIMP_API_KEY');
                $server = env('MAILCHIMP_SERVER_PREFIX');
                if ($apiKey && $server) {
                    try {
                        $base = "https://{$server}.api.mailchimp.com/3.0";
                        $emailLower = strtolower(trim($email));
                        $subscriberHash = md5($emailLower);
                        $memberUrl = "{$base}/lists/{$audienceId}/members/{$subscriberHash}";

                        $memberData = [
                            'email_address' => $email,
                            'status_if_new' => 'subscribed',
                            'merge_fields' => [
                                'FNAME' => $first,
                                'LNAME' => $last,
                                'PHONE' => $phone,
                            ],
                        ];

                        $mcRes = Http::withBasicAuth('anystring', $apiKey)->timeout(30)->put($memberUrl, $memberData);
                        if ($mcRes->ok()) {
                            $mc_upserted++;
                        } else {
                            $body = null;
                            try { $body = $mcRes->body(); } catch (\Exception $e) { $body = null; }
                            Log::warning('mailchimp upsert failed', ['audience' => $audienceId, 'email' => $email, 'status' => $mcRes->status(), 'url' => $memberUrl, 'body' => $body]);
                            if (count($mc_errors) < 10) {
                                // include member URL and the minimal request payload for easier debugging
                                $mc_errors[] = ['email' => $email, 'status' => $mcRes->status(), 'body' => $body, 'url' => $memberUrl, 'request' => ['email_address' => $email, 'merge_fields' => $memberData['merge_fields'] ?? []]];
                            }
                        }
                    } catch (\Exception $e) {
                        Log::warning('mailchimp upsert exception', ['email' => $email, 'error' => $e->getMessage()]);
                    }
                }
            } catch (\Exception $e) {
                \Illuminate\Support\Facades\Log::warning('mailchimp import row failed', ['email' => $email, 'error' => $e->getMessage()]);
                continue;
            }
        }

        fclose($handle);

    // persist an import log (include Mailchimp upsert count and skipped rows info)
        try {
            \App\Models\MailchimpImportLog::create([
                'filename' => $file->getClientOriginalName(),
                'audience_id' => (string)$audienceId,
                'imported_count' => $count,
                'raw_response' => ['imported' => $count, 'mailchimp_upserted' => $mc_upserted, 'mailchimp_upsert_errors' => $mc_errors, 'skipped' => $skipped, 'skipped_samples' => $skippedSamples],
            ]);
        } catch (\Exception $e) {
            Log::warning('failed to create mailchimp import log', ['error' => $e->getMessage()]);
        }

    $resp = ['status' => 'ok', 'imported' => $count, 'mailchimp_upserted' => $mc_upserted, 'filename' => $file->getClientOriginalName()];
    if (!empty($mc_errors)) $resp['mailchimp_upsert_errors'] = $mc_errors;
    return response()->json($resp);
    }

    // Accept a multipart file and enqueue an async import job. Returns task id immediately.
    public function importCsvAsync(Request $request, $audienceId)
    {
        if (!$request->hasFile('file')) {
            return response()->json(['status' => 'error', 'message' => 'No file uploaded'], 400);
        }

        $file = $request->file('file');
        if (!$file->isValid()) return response()->json(['status' => 'error', 'message' => 'Invalid file upload'], 400);

        $path = $file->store('mailchimp_imports');

        $task = \App\Models\MailchimpImportTask::create([
            'filename' => $file->getClientOriginalName(),
            'audience_id' => (string)$audienceId,
            'storage_path' => $path,
            'status' => 'queued',
            'queued_at' => now(),
        ]);

        // dispatch job
        try {
            dispatch(new \App\Jobs\MailchimpProcessImport($task->id));
        } catch (\Exception $e) {
            // queue may be misconfigured; mark failed
            $task->status = 'failed';
            $task->error_message = $e->getMessage();
            $task->save();
            return response()->json(['status' => 'error', 'message' => 'Failed to enqueue job', 'details' => $e->getMessage()], 500);
        }

        return response()->json(['status' => 'ok', 'task_id' => $task->id]);
    }

    // List import logs (recent)
    public function importLogs(Request $request)
    {
        $perPage = intval($request->query('per_page', 25));
        $page = intval($request->query('page', 1));
        $q = \App\Models\MailchimpImportLog::query()->orderBy('created_at', 'desc');
        $p = $q->paginate($perPage, ['*'], 'page', $page);
        return response()->json(['status' => 'ok', 'data' => $p->items(), 'meta' => ['total' => $p->total(), 'per_page' => $p->perPage(), 'current_page' => $p->currentPage(), 'last_page' => $p->lastPage()]]);
    }

    // List import tasks (queued/processing/completed)
    public function importTasks(Request $request)
    {
        $perPage = intval($request->query('per_page', 25));
        $page = intval($request->query('page', 1));
        $q = \App\Models\MailchimpImportTask::query()->orderBy('created_at', 'desc');
        $p = $q->paginate($perPage, ['*'], 'page', $page);
        return response()->json(['status' => 'ok', 'data' => $p->items(), 'meta' => ['total' => $p->total(), 'per_page' => $p->perPage(), 'current_page' => $p->currentPage(), 'last_page' => $p->lastPage()]]);
    }
}
