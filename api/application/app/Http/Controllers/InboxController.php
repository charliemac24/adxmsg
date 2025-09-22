<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\Inbox;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\DB;

class InboxController extends Controller
{
    /**
     * Return grouped inbox messages by phone (group_number). Each group contains
     * messages (inbound/outbound) sorted by date_executed and the last_message flag
     * marks the newest message in the group.
     *
     * Optional query params:
     * - q : filter by phone substring
     * - page, per_page : pagination for grouped results
     */
    public function index(Request $request)
    {
        $q = trim((string) $request->query('q', ''));
        $page = max(1, (int) $request->query('page', 1));
        $perPage = max(10, (int) $request->query('per_page', 25));

        // Normalize pagination inputs — guard against arrays (e.g. duplicate query keys)
        $pageRaw = $request->query('page', 1);
        if (is_array($pageRaw)) $pageRaw = reset($pageRaw) ?: 1;
        $page = max(1, (int) $pageRaw);

        $perPageRaw = $request->query('per_page', 25);
        if (is_array($perPageRaw)) $perPageRaw = reset($perPageRaw) ?: 25;
        // keep sensible bounds
        $perPage = max(10, min(200, (int) $perPageRaw));

        // Build base query: we will select rows where either from_number or to_number is present
        $base = Inbox::query()->where(function($s) {
            $s->whereNotNull('from_number')->orWhereNotNull('to_number');
        });

        if ($q !== '') {
            $base->where(function($s) use ($q) {
                $s->where('from_number', 'like', "%$q%")
                  ->orWhere('to_number', 'like', "%$q%");
            });
        }

        // Fetch all relevant rows (could be large; consider adding server-side limits later).
        // We'll group in PHP for correctness of mixed from/to grouping.
        $rows = $base->orderBy('date_executed', 'asc')->get();

        // Build a set of normalized phone numbers present in the inbox rows so we can look up contact names.
        $phoneCandidates = [];
        foreach ($rows as $r) {
            if (!empty($r->from_number)) $phoneCandidates[$this->normalizePhone($r->from_number)] = true;
            if (!empty($r->to_number)) $phoneCandidates[$this->normalizePhone($r->to_number)] = true;
        }
        $phoneCandidates = array_filter(array_keys($phoneCandidates));
        // ensure phone candidates are strings (avoid numeric key -> int casting issues)
        $phoneCandidates = array_values(array_map('strval', $phoneCandidates));

        // Map normalized phone -> contact full name (first_name + last_name) by scanning contacts table.
        $contactNameMap = [];
         if (!empty($phoneCandidates)) {
             try {
                 $contacts = DB::table('contacts')
                     ->select('id','first_name','last_name','primary_no')
                     ->where(function($q) {
                         $q->whereNotNull('primary_no');
                     })
                     ->get();
                 foreach ($contacts as $c) {
                     $pn = $this->normalizePhone($c->primary_no ?? '');
                     $name = trim(($c->first_name ?? '') . ' ' . ($c->last_name ?? ''));
// cast to string for a reliable strict comparison
if ($pn !== null && in_array((string)$pn, $phoneCandidates, true)) {
    $contactNameMap[(string)$pn] = $name ?: ($contactNameMap[(string)$pn] ?? '');
}
                 }
             } catch (\Exception $e) {
                 Log::warning('InboxController: contact lookup failed: ' . $e->getMessage());
             }
         }
 
        // Group by canonical group number: prefer numeric digits-only without plus for grouping
        $groups = [];
        foreach ($rows as $r) {
            $from = $r->from_number;
            $to = $r->to_number;
            // Choose group key: prefer the non-null phone among from/to; if both present choose the one representing the 'other' party
            $groupNumber = null;
            if (!empty($from)) {
                $groupNumber = $this->normalizePhone($from);
            } elseif (!empty($to)) {
                $groupNumber = $this->normalizePhone($to);
            }
            if (!$groupNumber) continue;

            if (!isset($groups[$groupNumber])) $groups[$groupNumber] = [];

            // Determine a display name for this message (prefer from_number then to_number)
            $displayName = null;
            $fromNorm = $this->normalizePhone($from ?? '');
            $toNorm = $this->normalizePhone($to ?? '');
            if ($fromNorm && isset($contactNameMap[$fromNorm]) && $contactNameMap[$fromNorm] !== '') {
                $displayName = $contactNameMap[$fromNorm];
            } elseif ($toNorm && isset($contactNameMap[$toNorm]) && $contactNameMap[$toNorm] !== '') {
                $displayName = $contactNameMap[$toNorm];
            }

            $groups[$groupNumber][] = [
                'id' => $r->id,
                'group_number' => $groupNumber,
                'direction' => $r->direction,
                'from_number' => $r->from_number,
                'to_number' => $r->to_number,
                'display_name' => $displayName, // new, may be null if contact not found
                'is_read' => (bool) $r->is_read,
                'is_starred' => (bool) $r->is_starred,
                'message_body' => $r->message_body,
                'status' => $r->status,
                'twilio_sid' => $r->twilio_sid,
                'conversation_id' => $r->conversation_id,
                'date_executed' => $r->date_executed ? $r->date_executed->toIso8601String() : null,
                // last_message will be set later
                'last_message' => false,
            ];
        }

        // Remove conversation groups that contain only a single message which is outbound.
        // This avoids showing one-off outbound-only messages as conversations.
        foreach ($groups as $gk => $items) {
            if (count($items) === 1) {
                $dir = strtolower((string)($items[0]['direction'] ?? ''));
                if (strpos($dir, 'out') !== false || strpos($dir, 'sent') !== false) {
                    unset($groups[$gk]);
                }
            }
        }

    // Build output groups array; within each group, mark the last message (latest date_executed)
        $out = [];
        foreach ($groups as $groupNumber => $items) {
            // sort by date_executed ascending (we already fetched asc) but ensure proper ordering when nulls present
            usort($items, function($a, $b) {
                $ta = $a['date_executed'] ? strtotime($a['date_executed']) : 0;
                $tb = $b['date_executed'] ? strtotime($b['date_executed']) : 0;
                return $ta <=> $tb;
            });

            // last message is the one with the greatest timestamp
            // If multiple items share the same timestamp, prefer an outbound message
            $maxTs = null;
            foreach ($items as $idx => $it) {
                $ts = $it['date_executed'] ? strtotime($it['date_executed']) : 0;
                if ($maxTs === null || $ts > $maxTs) $maxTs = $ts;
            }
            if ($maxTs === null) $maxTs = 0;

            $candidateIndexes = [];
            foreach ($items as $idx => $it) {
                $ts = $it['date_executed'] ? strtotime($it['date_executed']) : 0;
                if ($ts === $maxTs) $candidateIndexes[] = $idx;
            }

            $lastIndex = null;
            if (count($candidateIndexes) > 0) {
                // prefer outbound among candidates
                foreach ($candidateIndexes as $ci) {
                    $dir = strtolower((string)($items[$ci]['direction'] ?? ''));
                    if (strpos($dir, 'out') !== false || strpos($dir, 'sent') !== false) { $lastIndex = $ci; break; }
                }
                if ($lastIndex === null) {
                    $lastIndex = $candidateIndexes[count($candidateIndexes) - 1];
                }
            } else {
                if (count($items) > 0) $lastIndex = count($items) - 1;
            }

            if ($lastIndex !== null) $items[$lastIndex]['last_message'] = true;

            // push each item in the group to output (preserve ascending order)
            foreach ($items as $it) {
                $it['unread_count'] = 0; // placeholder, we'll attach DB counts later
                $out[] = $it;
            }
        }

        // Paginate results by group_number: sort groups by their latest message timestamp (desc)
        // so the first page contains conversations with the newest latest messages.
        $groupKeys = array_keys($groups);
        // build a map of group => max timestamp
        $groupLatest = [];
        foreach ($groups as $gk => $items) {
            $maxTs = 0;
            foreach ($items as $it) {
                $ts = $it['date_executed'] ? strtotime($it['date_executed']) : 0;
                if ($ts > $maxTs) $maxTs = $ts;
            }
            $groupLatest[$gk] = $maxTs;
        }
        // sort keys by latest ts desc
        usort($groupKeys, function($a, $b) use ($groupLatest) {
            $ta = isset($groupLatest[$a]) ? $groupLatest[$a] : 0;
            $tb = isset($groupLatest[$b]) ? $groupLatest[$b] : 0;
            if ($ta === $tb) return 0;
            return $tb <=> $ta;
        });

        $totalGroups = count($groupKeys);
        $sliceKeys = array_slice($groupKeys, ($page - 1) * $perPage, $perPage);

        $pagedOut = [];
        foreach ($sliceKeys as $gk) {
            // include all items for that group in ascending order, but mark last_message as above
            foreach ($groups[$gk] as $it) {
                // find the corresponding prepared item in $out by id to pick up last_message flag
                foreach ($out as $prepared) {
                    if ($prepared['id'] === $it['id']) {
                        // attach a group-level display name if available (show contact name for the conversation)
                        $groupDisplay = $contactNameMap[$gk] ?? null;
                        // if no mapped name yet, attempt direct lookup where contacts.primary_no (normalized) == group_number
                        if (empty($groupDisplay)) {
                            try {
                                $maybe = DB::table('contacts')
                                    ->select('first_name','last_name','primary_no','mobile')
                                    ->where(function($q) use ($gk) {
                                        $q->where('primary_no', 'like', "%$gk%")->orWhere('mobile', 'like', "%$gk%");
                                    })->get();
                                foreach ($maybe as $mc) {
                                    $pn = preg_replace('/\D+/', '', (string)($mc->primary_no ?? ''));
                                    $mn = preg_replace('/\D+/', '', (string)($mc->mobile ?? ''));
                                    if ($pn === (string)$gk || $mn === (string)$gk) {
                                        $groupDisplay = trim(($mc->first_name ?? '') . ' ' . ($mc->last_name ?? ''));
                                        // cache for later
                                        if ($groupDisplay) $contactNameMap[$gk] = $groupDisplay;
                                        break;
                                    }
                                }
                            } catch (\Exception $e) {
                                Log::warning('InboxController: group-level contact lookup failed: ' . $e->getMessage());
                            }
                        }
                        $prepared['group_display_name'] = $groupDisplay ?? null;
                         $pagedOut[] = $prepared; break;
                    }
                }
            }
        }

        // Attach unread counts via a single DB query using group_number when available
        $groupNums = array_values($groupKeys);
        if (count($groupNums) > 0) {
            // Attempt to use group_number column when populated for a single aggregated query
            $counts = Inbox::selectRaw("COALESCE(group_number, '') as group_number, COUNT(*) as unread_count")
                ->whereIn('group_number', $groupNums)
                ->where(function($q){
                    $q->where('direction', '!=', 'outbound')->orWhere('direction', 'not like', '%out%');
                })
                ->where(function($q){
                    $q->whereNull('status')->orWhere('status', '!=', 'read');
                })
                ->groupBy('group_number')
                ->pluck('unread_count', 'group_number')
                ->toArray();

            // If group_number aggregation returned nothing (old data), fallback to per-group LIKE counting
            if (empty($counts)) {
                foreach ($groupNums as $g) {
                    if (!$g) continue;
                    $c = Inbox::where(function($q) use ($g) {
                        $q->where('from_number', 'like', "%$g%")
                          ->orWhere('to_number', 'like', "%$g%");
                    })->where(function($q){
                        $q->where('direction', '!=', 'outbound')->orWhere('direction', 'not like', '%out%');
                    })->where(function($q){
                        $q->whereNull('status')->orWhere('status', '!=', 'read');
                    })->count();
                    $counts[$g] = $c;
                }
            }

            // Map counts back onto $pagedOut (only on last_message items)
            foreach ($pagedOut as &$item) {
                $g = isset($item['group_number']) && $item['group_number'] !== '' ? $item['group_number'] : null;
                if ($g && !empty($item['last_message'])) {
                    $item['unread_count'] = isset($counts[$g]) ? (int)$counts[$g] : 0;
                }
            }
            unset($item);
        }

        return response()->json([
            'data' => $pagedOut,
            'total_groups' => $totalGroups,
            'per_page' => $perPage,
            'current_page' => $page,
        ]);
    }

    /**
     * Soft-delete an inbox conversation and all rows related to its phone number.
     * This will set `deleted_at` on matched Inbox rows and record any twilio_sid
     * values into deleted_inbound_twilio_sids to tombstone remote imports.
     *
     * @param \Illuminate\Http\Request $request
     * @param mixed $id
     * @return \Illuminate\Http\JsonResponse
     */
    public function destroy(Request $request, $id)
    {
        try {
            // Try to find by numeric DB id first. If not found, treat the $id as a phone string
            $row = Inbox::find($id);
            if (!$row) {
                // attempt to treat $id as a phone and delete by group_number
                $phoneNorm = $this->normalizePhone($id);
                if ($phoneNorm) {
                    return $this->destroyByPhone($request, $phoneNorm);
                }
                return response()->json(['error' => 'not found'], 404);
            }

            // Determine grouping key: prefer explicit group_number when present
            $group = $row->group_number ?? null;

            $matched = collect();
            if (!empty($group)) {
                // match exact group_number
                $matched = Inbox::where('group_number', $group)->get();
            }

            if ($matched->isEmpty()) {
                // fallback: derive normalized phone from from_number or to_number
                $phone = $row->from_number ?: $row->to_number ?: null;
                $phoneNorm = $this->normalizePhone($phone);
                if ($phoneNorm) {
                    // match rows where from_number or to_number contains the digits
                    $matched = Inbox::where(function($q) use ($phoneNorm) {
                        $q->where('from_number', 'like', "%$phoneNorm%")
                          ->orWhere('to_number', 'like', "%$phoneNorm%");
                    })->get();
                }
            }

            if ($matched->isEmpty()) {
                // last resort: delete the single row
                $matched = collect([$row]);
            }

            $deletedCount = 0;
            $tombstoned = 0;

            foreach ($matched as $m) {
                try {
                    // record twilio sid tombstone when present
                    if (!empty($m->twilio_sid)) {
                        try {
                            \Illuminate\Support\Facades\DB::table('deleted_inbound_twilio_sids')->updateOrInsert([
                                'twilio_sid' => $m->twilio_sid
                            ], ['deleted_by' => null, 'created_at' => now(), 'updated_at' => now()]);
                            $tombstoned++;
                        } catch (\Exception $e) {
                            Log::warning('Failed to record tombstone for inbox destroy: ' . $e->getMessage());
                        }
                    }

                    // Soft-delete via Eloquent so deleted_at is populated
                    $m->delete();
                    $deletedCount++;
                } catch (\Exception $e) {
                    Log::warning('Failed to delete inbox row id=' . ($m->id ?? 'unknown') . ': ' . $e->getMessage());
                }
            }

            return response()->json(['status' => 'ok', 'deleted' => $deletedCount, 'tombstoned' => $tombstoned]);
        } catch (\Exception $e) {
            Log::error('Inbox destroy failed: ' . $e->getMessage());
            return response()->json(['error' => 'failed', 'message' => $e->getMessage()], 500);
        }
    }

    /**
     * Soft-delete an inbox conversation by phone/group_number.
     * This accepts a phone string from the front-end, normalizes it and
     * deletes all Inbox rows where `group_number` equals the normalized value.
     *
     * @param \Illuminate\Http\Request $request
     * @param string $phone
     * @return \Illuminate\Http\JsonResponse
     */
    public function destroyByPhone(Request $request, $phone)
    {
        try {
            $phoneNorm = $this->normalizePhone($phone);
            if (!$phoneNorm) return response()->json(['error' => 'invalid phone'], 400);

            // Find rows that have group_number exactly matching the normalized phone
            $matched = Inbox::where('group_number', $phoneNorm)->get();

            // If nothing found, return a not found response so the frontend can decide fallback behavior
            if ($matched->isEmpty()) {
                return response()->json(['status' => 'ok', 'deleted' => 0, 'tombstoned' => 0, 'message' => 'no rows matched group_number'], 200);
            }

            $deletedCount = 0;
            $tombstoned = 0;

            foreach ($matched as $m) {
                try {
                    if (!empty($m->twilio_sid)) {
                        try {
                            \Illuminate\Support\Facades\DB::table('deleted_inbound_twilio_sids')->updateOrInsert([
                                'twilio_sid' => $m->twilio_sid
                            ], ['deleted_by' => null, 'created_at' => now(), 'updated_at' => now()]);
                            $tombstoned++;
                        } catch (\Exception $e) {
                            Log::warning('Failed to record tombstone for inbox destroyByPhone: ' . $e->getMessage());
                        }
                    }

                    $m->delete();
                    $deletedCount++;
                } catch (\Exception $e) {
                    Log::warning('Failed to delete inbox row id=' . ($m->id ?? 'unknown') . ' in destroyByPhone: ' . $e->getMessage());
                }
            }

            return response()->json(['status' => 'ok', 'deleted' => $deletedCount, 'tombstoned' => $tombstoned]);
        } catch (\Exception $e) {
            Log::error('Inbox destroyByPhone failed: ' . $e->getMessage());
            return response()->json(['error' => 'failed', 'message' => $e->getMessage()], 500);
        }
    }

    /**
     * Mark all inbound messages for a phone as read
     */
    public function markPhoneRead(Request $request, $phone)
    {
       
        $phoneNorm = $this->normalizePhone($phone);
         
        if (!$phoneNorm) return response()->json(['error' => 'invalid phone'], 400);
        
        // Build base where clause
        $query = Inbox::where(function($q) use ($phoneNorm) {
            $q->where('from_number', 'like', "%$phoneNorm%")
              ->orWhere('to_number', 'like', "%$phoneNorm%");
        });       

        // Only mark inbound (not outbound)
        $query->where(function($q){
            $q->where('direction', '!=', 'outbound')->orWhere('direction', 'not like', '%out%');
        });

        // Only affect rows not already marked read
        $toUpdate = (clone $query)->where(function($q){
            $q->whereNull('status')->orWhere('status', '!=', 'read');
        });

        $updated = $toUpdate->update(['status' => 'read', 'is_read' => true, 'read_at' => now(), 'updated_at' => now()]);

        $remaining = (clone $query)->where(function($q){
            $q->whereNull('status')->orWhere('status', '!=', 'read');
        })->count();

        return response()->json(['ok' => true, 'updated' => $updated, 'unread_count' => $remaining]);
    }

    /**
     * Backwards-compatible alias: mark inbox rows read for a given phone.
     * This accepts the same phone string formats as `markPhoneRead` and
     * will set `status = 'read'`, `is_read = true`, and `read_at = now()`
     * on matching inbound rows.
     */
    public function markReadByPhone(Request $request, $phone)
    {
        try {
            $phoneNorm = $this->normalizePhone($phone);
            if (!$phoneNorm) return response()->json(['error' => 'invalid phone'], 400);

            // Build query to match rows by exact group_number or by like on from/to numbers
            $query = Inbox::where(function($q) use ($phoneNorm) {
                $q->where('group_number', $phoneNorm)
                  ->orWhere('from_number', 'like', "%$phoneNorm%")
                  ->orWhere('to_number', 'like', "%$phoneNorm%");
            });

            // Update rows regardless of direction (apply to inbound and outbound)
            // Only update rows not already marked as read
            $toUpdate = (clone $query)->where(function($q){
                $q->whereNull('status')->orWhere('status', '!=', 'read');
            });

            $updated = $toUpdate->update(['status' => 'read', 'is_read' => true, 'read_at' => now(), 'updated_at' => now()]);

            return response()->json(['ok' => true, 'updated' => $updated]);
        } catch (\Exception $e) {
            Log::error('Inbox::markReadByPhone failed: ' . $e->getMessage());
            return response()->json(['error' => 'failed', 'message' => $e->getMessage()], 500);
        }
    }

    /**
     * Mark a single inbox message as read
     */
    public function markMessageRead(Request $request, $id)
    {
        $m = Inbox::find($id);
        if (!$m) return response()->json(['error' => 'not found'], 404);

        // If this message already appears read, nothing to do
        if (strtolower((string)$m->status) === 'read' || $m->is_read) {
            return response()->json(['ok' => true, 'updated' => 0]);
        }

        // Attempt to mark the entire conversation (by group_number or normalized phone) as read.
        // Prefer exact group_number when available for efficiency and correctness.
        $group = $m->group_number ?? null;
        $updated = 0;

        if (!empty($group)) {
            // Mark all inbound rows that belong to this group_number and are not read
            $query = Inbox::where('group_number', $group)->where(function($q){
                $q->where('direction', '!=', 'outbound')->orWhere('direction', 'not like', '%out%');
            });

            $toUpdate = (clone $query)->where(function($q){
                $q->whereNull('status')->orWhere('status', '!=', 'read');
            });

            $updated = $toUpdate->update(['status' => 'read', 'is_read' => true, 'read_at' => now(), 'updated_at' => now()]);
        } else {
            // Fallback: normalize phone from from_number/to_number and mark any matching inbound rows
            $phone = $m->from_number ?: $m->to_number ?: null;
            $phoneNorm = $this->normalizePhone($phone);
            if ($phoneNorm) {
                $query = Inbox::where(function($q) use ($phoneNorm) {
                    $q->where('from_number', 'like', "%$phoneNorm%")
                      ->orWhere('to_number', 'like', "%$phoneNorm%");
                })->where(function($q){
                    $q->where('direction', '!=', 'outbound')->orWhere('direction', 'not like', '%out%');
                });

                $toUpdate = (clone $query)->where(function($q){
                    $q->whereNull('status')->orWhere('status', '!=', 'read');
                });

                $updated = $toUpdate->update(['status' => 'read', 'is_read' => true, 'read_at' => now(), 'updated_at' => now()]);
            }
        }

        // If we didn't update any rows via group/phone (edge cases), fall back to marking the single message
        if ($updated === 0) {
            $m->status = 'read';
            $m->is_read = true;
            $m->read_at = now();
            $m->updated_at = now();
            $m->save();
            $updated = 1;
        }

        return response()->json(['ok' => true, 'updated' => $updated]);
    }

    /**
     * Toggle star on an inbox message (persisted)
     */
    public function toggleStar(Request $request, $id)
    {
        $m = Inbox::find($id);
        if (!$m) return response()->json(['error' => 'not found'], 404);
        $m->is_starred = !$m->is_starred;
        $m->save();
        return response()->json(['status' => 'ok', 'is_starred' => (bool) $m->is_starred]);
    }

    protected function normalizePhone($p)
    {        
        if (empty($p)) return null;
        // remove non-digits
        $digits = preg_replace('/\D+/', '', $p);
        // strip leading zeros? keep as-is — caller expects same numeric string
        return $digits;
    }
}
