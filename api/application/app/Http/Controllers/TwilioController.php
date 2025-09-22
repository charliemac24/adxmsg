<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Twilio\Rest\Client;

class TwilioController extends Controller
{
    /**
     * Return Twilio account balance (credits) so the frontend can monitor credits.
     * Cached for short period to avoid hitting Twilio on every UI refresh.
     */
    public function balance(Request $request)
    {
        $cacheKey = 'twilio_balance_raw';
        $ttl = 60; // seconds

        // allow bypassing cache for debugging by ?nocache=1
        if (!$request->boolean('nocache') && Cache::has($cacheKey)) {
            return response()->json(['status' => 'ok', 'cached' => true, 'data' => Cache::get($cacheKey)]);
        }

        $sid = config('services.twilio.sid') ?: env('TWILIO_ACCOUNT_SID');
        $token = config('services.twilio.token') ?: env('TWILIO_AUTH_TOKEN');

        if (empty($sid) || empty($token)) {
            return response()->json(['error' => 'twilio_credentials_missing'], 500);
        }

        try {
            $twilio = new Client($sid, $token);

            // Fetch account balance (v2010) and account info (friendly name) where available
            $balanceInstance = null;
            $accountInstance = null;

            try {
                $balanceInstance = $twilio->api->v2010->accounts($sid)->balance->fetch();
            } catch (\Throwable $inner) {
                // non-fatal: some Twilio accounts or SDK versions may differ
                $balanceInstance = null;
            }

            try {
                $accountInstance = $twilio->api->v2010->accounts($sid)->fetch();
            } catch (\Throwable $inner) {
                $accountInstance = null;
            }

            $data = [
                'balance' => $balanceInstance->balance ?? null,
                'currency' => $balanceInstance->currency ?? null,
                'date_updated' => $balanceInstance->date_updated ?? null,
                'account_sid' => $accountInstance->sid ?? $sid,
                'friendly_name' => $accountInstance->friendly_name ?? ($accountInstance->friendlyName ?? null),
            ];

            // cache a lightweight version
            $cacheData = [
                'balance' => $data['balance'],
                'currency' => $data['currency'],
                'date_updated' => $data['date_updated'],
                'account_sid' => $data['account_sid'],
                'friendly_name' => $data['friendly_name'],
            ];
            Cache::put($cacheKey, $cacheData, $ttl);

            return response()->json(['status' => 'ok', 'cached' => false, 'data' => $cacheData]);
        } catch (\Throwable $e) {
            return response()->json(['error' => 'failed_fetch_balance', 'message' => $e->getMessage()], 500);
        }
    }
}
