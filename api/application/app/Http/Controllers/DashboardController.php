<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Cache;
use Carbon\Carbon;

class DashboardController extends Controller
{
    /**
     * Return a N-day series of inbound message counts (most recent day last).
     * Accepts optional `?days=` query parameter (default 7, clamped 1..90).
     * Response: { data: [int,int,...] } (length = days)
     */
    public function messages7Days(Request $request)
    {
        $days = intval($request->query('days', 7));
        // clamp to reasonable range (allow up to 365 days / 1 year)
        $days = max(1, min(365, $days));
        $today = Carbon::today();

        // Initialize buckets (oldest -> newest)
        $buckets = [];
        for ($i = $days - 1; $i >= 0; $i--) {
            $d = $today->copy()->subDays($i)->toDateString();
            $buckets[$d] = 0;
        }

        // Query inbound_messages created in the last N days grouped by date
        $cacheKey = 'dashboard_messages_' . $days . 'days';
        $ttl = 60; // seconds

        $rows = Cache::remember($cacheKey, $ttl, function () use ($today, $days) {
            $fromDate = $today->copy()->subDays($days - 1)->startOfDay()->toDateTimeString();
            $toDate = $today->copy()->endOfDay()->toDateTimeString();

            return DB::table('inbound_messages')
                ->select(DB::raw('DATE(received_at) as day'), DB::raw('COUNT(*) as cnt'))
                ->whereBetween('received_at', [$fromDate, $toDate])
                ->groupBy('day')
                ->orderBy('day')
                ->get();
        });

        foreach ($rows as $r) {
            if (isset($buckets[$r->day])) {
                $buckets[$r->day] = (int)$r->cnt;
            }
        }

        // Build an array of { date, count } objects (oldest -> newest)
        $out = [];
        foreach ($buckets as $date => $count) {
            $out[] = ['date' => $date, 'count' => (int)$count];
        }

        return response()->json(['status' => 'ok', 'data' => $out]);
    }
}
