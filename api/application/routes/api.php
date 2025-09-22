<?php

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\Facades\Artisan;

/* Controllers */
use App\Http\Controllers\AuthController;
use App\Http\Controllers\ContactsController;
use App\Http\Controllers\AddressStateController;
use App\Http\Controllers\GroupsController;
use App\Http\Controllers\OptoutLoggerController;
use App\Http\Controllers\OptinLoggerController;
use App\Http\Controllers\OutboundMessageController;
use App\Http\Controllers\InboundMessageController;
use App\Http\Controllers\InboxController;
use App\Http\Controllers\CampaignController;
use App\Http\Controllers\DashboardController;
use App\Http\Controllers\TwilioController;
use App\Http\Controllers\MailchimpController;
use App\Http\Controllers\CampaignTemplateController;

/*
|--------------------------------------------------------------------------
| API Routes (v1)
|--------------------------------------------------------------------------
|
| Routes are organized by feature area for clarity.
|
*/

Route::middleware('auth:sanctum')->get('/user', function (Request $request) {
    return $request->user();
});

Route::prefix('v1')->group(function () {

    /*
    |--------------------------------------------------------------------------
    | Authentication
    |--------------------------------------------------------------------------
    */
    Route::post('/auth/login', [AuthController::class, 'login']);
    Route::post('/auth/logout', [AuthController::class, 'logout'])->middleware('auth:sanctum');

    /*
    |--------------------------------------------------------------------------
    | Contacts / Groups / Address States
    |--------------------------------------------------------------------------
    */
    Route::post('/contacts/bulk-delete', [ContactsController::class, 'bulkDelete']);
    Route::put('/contacts/bulk-assign-group', [ContactsController::class, 'bulkAssignGroup']);
    Route::put('/contacts/bulk-assign-state', [ContactsController::class, 'bulkAssignState']);
    Route::post('/contacts/bulk-unsubscribe', [ContactsController::class, 'bulkUnsubscribe']);
    Route::post('/contacts/bulk-resubscribe', [ContactsController::class, 'bulkResubscribe']);

    Route::post('/contacts', [ContactsController::class, 'store']);
    Route::put('/contacts/{id}', [ContactsController::class, 'update']);
    Route::patch('/contacts/{id}', [ContactsController::class, 'update']);
    Route::delete('/contacts/{id}', [ContactsController::class, 'destroy']);

    Route::post('/contacts/import', [ContactsController::class, 'importCsv']);
    Route::get('/contacts/import-history', [ContactsController::class, 'importCsvHistory']);
    Route::get('/contacts/total-count', [ContactsController::class, 'totalCount']);
    Route::get('/contacts/total-unsubscribed', [ContactsController::class, 'totalUnsubscribed']);
    Route::get('/contacts/count-by-group', [ContactsController::class, 'countByGroup']);
    Route::get('/contacts/count-by-state', [ContactsController::class, 'countByState']);
    Route::get('/contacts/export', [ContactsController::class, 'exportCsv']);
    Route::get('/contacts/export/preview', [ContactsController::class, 'exportPreview']);

    Route::post('/contacts/{id}/unsubscribe', [ContactsController::class, 'unsubscribe']);
    Route::post('/optout/{contact_id}', [OptoutLoggerController::class, 'optout'])->name('optout.contact');
    Route::post('/optin/{contact_id}', [OptinLoggerController::class, 'optin'])->name('optin.contact');

    Route::post('/address-states', [AddressStateController::class, 'store']);
    Route::put('/address-states/{id}', [AddressStateController::class, 'update']);
    Route::patch('/address-states/{id}', [AddressStateController::class, 'update']);
    Route::delete('/address-states/{id}', [AddressStateController::class, 'destroy']);

    Route::post('/groups', [GroupsController::class, 'store']);
    Route::put('/groups/{id}', [GroupsController::class, 'update']);
    Route::patch('/groups/{id}', [GroupsController::class, 'update']);
    Route::delete('/groups/{id}', [GroupsController::class, 'destroy']);

    /*
    |--------------------------------------------------------------------------
    | Inbound / Inbox (thread, mark-read, archive, etc.)
    |--------------------------------------------------------------------------
    */
    // Inbound webhooks / sync
    Route::post('/inbound/auto-response', [InboundMessageController::class, 'autoResponseWebhook'])->name('inbound.auto_response'); // Will be configured in Twilio console
    Route::get('/cron/inbound/sync', function (Request $request) {
        $token = $request->query('token');
        $expected = env('CRON_TRIGGER_TOKEN');
        if (!$token || !$expected || hash_equals((string) $expected, (string) $token) === false) {
            return response()->json(['error' => 'Unauthorized'], 401);
        }

        try {
            Artisan::call('inbound:sync');
            Artisan::call('outbound:sync');
            Artisan::call('migrate:inbox');
        } catch (\Exception $e) {
            return response()->json(['error' => 'failed', 'message' => $e->getMessage()], 500);
        }
    });

    // Inbound message management (InboundMessages manages the Thread for now)
    Route::get('/inbound/phone/{phone}/thread', [InboundMessageController::class, 'threadByPhone']); // This is active
    Route::post('/inbound/{id}/reply', [InboundMessageController::class, 'reply']); // this is active
    
    // Phone-based mark-read (uses InboxController to update unified inbox)
    Route::post('/inbound/phone/{phone}/mark-read', [InboxController::class, 'markReadByPhone']); // This is active
    Route::get('/inbound/messages', [InboundMessageController::class, 'index']);
    // Debug
    Route::get('/debug/phone/{phone}/messages', [InboundMessageController::class, 'debugPhoneMessages']);

    /*
    |--------------------------------------------------------------------------
    | Unified Inbox (grouped conversations)
    |--------------------------------------------------------------------------
    */
    Route::get('/inbox/groups', [InboxController::class, 'index']); // active    
    Route::post('/inbox/phone/{phone}/mark-read', [InboxController::class, 'markPhoneRead']); // active
    Route::post('/inbox/{id}/star', [InboxController::class, 'toggleStar']); // active
    Route::post('/inbox/phone/{phone}/delete', [InboxController::class, 'destroyByPhone']); // active

    // Cron trigger
    Route::get('/cron/inbox/groups', [InboxController::class, 'index']);

    /*
    |--------------------------------------------------------------------------
    | Outbound / Sending
    |--------------------------------------------------------------------------
    */
    Route::post('/outbound/send', [OutboundMessageController::class, 'send'])->name('outbound.send');
    Route::post('/outbound/send-to-groups', [OutboundMessageController::class, 'sendToGroups'])->name('outbound.send.groups');
    Route::post('/outbound/send-by-state', [OutboundMessageController::class, 'sendByState'])->name('outbound.send.by_state');
    Route::delete('/outbound/sent', [OutboundMessageController::class, 'deleteSentItems']);

    /*
    |--------------------------------------------------------------------------
    | Campaigns & Templates
    |--------------------------------------------------------------------------
    */
    Route::post('/campaigns', [CampaignController::class, 'store']);
    // Save campaign as Draft
    Route::post('/campaigns/draft', [CampaignController::class, 'storeDraft']);
    Route::put('/campaigns/{id}', [CampaignController::class, 'update']);
    Route::delete('/campaigns/bulk-delete', [CampaignController::class, 'bulkDelete']);

    Route::get('/campaign-templates', [CampaignTemplateController::class, 'index']);
    Route::post('/campaign-templates', [CampaignTemplateController::class, 'store']);
    Route::get('/campaign-templates/{id}', [CampaignTemplateController::class, 'show']);
    Route::put('/campaign-templates/{id}', [CampaignTemplateController::class, 'update']);
    Route::delete('/campaign-templates/{id}', [CampaignTemplateController::class, 'destroy']);
    Route::post('/campaign-templates/{id}/send', [CampaignTemplateController::class, 'sendTemplate']);

    // Cron trigger for scheduled campaigns
    Route::get('/cron/campaigns/send-scheduled', function (Request $request) {
        $token = $request->query('token');
        $expected = env('CRON_TRIGGER_TOKEN');
        if (!$token || !$expected || hash_equals((string) $expected, (string) $token) === false) {
            return response()->json(['error' => 'Unauthorized'], 401);
        }

        try {
            Artisan::call('campaigns:send-scheduled');
            $output = Artisan::output();
            return response()->json(['status' => 'ok', 'output' => $output]);
        } catch (\Exception $e) {
            return response()->json(['error' => 'failed', 'message' => $e->getMessage()], 500);
        }
    });

    /*
    |--------------------------------------------------------------------------
    | Mailchimp
    |--------------------------------------------------------------------------
    */
    Route::post('/mailchimp/sync/{audienceId}', [MailchimpController::class, 'syncAudience']);
    Route::get('/mailchimp/contacts/{audienceId?}', [MailchimpController::class, 'contacts']);
    Route::post('/mailchimp/import', [MailchimpController::class, 'importCsv']);
    Route::post('/mailchimp/import-async/{audienceId}', [MailchimpController::class, 'importCsvAsync']);
    Route::get('/mailchimp/import-logs', [MailchimpController::class, 'importLogs']);
    Route::get('/mailchimp/import-tasks', [MailchimpController::class, 'importTasks']);
    Route::get('/mailchimp/export/{audienceId?}', [MailchimpController::class, 'exportAudience']);
    Route::post('/mailchimp/dedupe/{audienceId?}', [MailchimpController::class, 'dedupeAudience']);

    /*
    |--------------------------------------------------------------------------
    | Twilio / Misc / Dashboard
    |--------------------------------------------------------------------------
    */
    Route::get('/twilio/balance', [TwilioController::class, 'balance']);
    Route::get('/dashboard/messages-7days', [DashboardController::class, 'messages7Days']);

    /*
    |--------------------------------------------------------------------------
    | Debug / CORS / Utilities
    |--------------------------------------------------------------------------
    */
    Route::match(['get','post','options'], '/debug-cors', function (Request $request) {
        return response()->json([
            'ok' => true,
            'method' => $request->method(),
            'origin' => $request->header('Origin'),
            'authorization' => $request->header('Authorization'),
            'accept' => $request->header('Accept'),
            'all_headers' => $request->headers->all(),
        ]);
    });

    // legacy / reference (commented) routes -- keep here for manual review if needed
    // Route::post('/outbound/send-bulk', [OutboundMessageController::class, 'sendBulk'])->name('outbound.send.bulk');

    // Inactive
    #Route::post('/inbound/{id}/mark-read', [InboundMessageController::class, 'markRead']); // inactive
    #Route::post('/inbound/{id}/mark-unread', [InboundMessageController::class, 'markUnread']); // inactive
    #Route::post('/inbound/{id}/star', [InboundMessageController::class, 'toggleStar']);
    #Route::post('/inbound/{id}/archive', [InboundMessageController::class, 'archive']);
    #Route::delete('/inbound/{id}', [InboundMessageController::class, 'destroy'])->where('id', '[0-9]+');
    //Route::post('/inbound/{id}/view-log', [InboundMessageController::class, 'logView'])->where('id', '[0-9]+'); // Keep this for future feature
    #Route::post('/inbox/{id}/mark-read', [InboxController::class, 'markMessageRead']); // inactive
    #Route::delete('/inbox/{id}', [InboxController::class, 'destroy']); // inactive
    #Route::post('/inbox/{id}/delete', [InboxController::class, 'destroy']); // inactive
    #Route::delete('/inbox/phone/{phone}', [InboxController::class, 'destroyByPhone']); // inactive
    //Route::post('/outbound/send-bulk', [OutboundMessageController::class, 'sendBulk'])->name('outbound.send.bulk'); // deprecated / disabled
    #Route::get('/inbound/messages', [InboundMessageController::class, 'index']); // inactive
    #Route::delete('/inbound/bulk-delete', [InboundMessageController::class, 'bulkDelete']); // inactive
    #Route::post('/inbound/bulk-delete', [InboundMessageController::class, 'bulkDelete']); // inactive
    #Route::post('/inbound/threads/latest-by-phone', [InboundMessageController::class, 'latestThreadsByPhones']); // inactive

    #Route::get('/inbound/{id}/thread', [InboundMessageController::class, 'thread'])->where('id', '[0-9]+'); // inactive

});