<?php

use App\Http\Controllers\AddressStateController;
use App\Http\Controllers\ContactsController;
use App\Http\Controllers\GroupsController;
use App\Http\Controllers\OutboundMessageController;
use App\Http\Controllers\CampaignController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| Web Routes
|--------------------------------------------------------------------------
|
| Here is where you can register web routes for your application. These
| routes are loaded by the RouteServiceProvider within a group which
| contains the "web" middleware group. Now create something great!
|
*/

Route::get('/', function () {
    return view('welcome');
});

Route::prefix('v1')->group(function () {

    // Retrieve all contacts
    Route::get('/contacts', [ContactsController::class, 'index']);

    // Retrieve a contact by ID (only numeric IDs) to avoid catching non-numeric routes like /contacts/export
    Route::get('/contacts/{id}', [ContactsController::class, 'show'])->where('id', '[0-9]+');

    // Retrieve contacts by address_state
    Route::get('/contacts/address_state/{address_state}', [ContactsController::class, 'getByAddressState']);

    // Retrieve contacts by group_no
    Route::get('/contacts/group/{group_no}', [ContactsController::class, 'getContactsByGroup']);

    // Retrieve all address states
    Route::get('/address-states', [AddressStateController::class, 'index']);

    // Retrieve an address state by ID
    Route::get('/address-states/{id}', [AddressStateController::class, 'show']);

    // Retrieve all groups
    Route::get('/groups', [GroupsController::class, 'index']);

    // Retrieve a group by ID
    Route::get('/groups/{id}', [GroupsController::class, 'show']);

    // Retrieve sent outbound messages
    Route::get('/outbound/sent', [OutboundMessageController::class, 'getSentItems']);

    // Retrieve all campaigns
    Route::get('/campaigns', [CampaignController::class, 'index']);
    
    // Public unsubscribe link: GET /v1/unsubscribe/{id}/{sig}
    Route::get('/unsubscribe/{id}/{sig}', [ContactsController::class, 'publicUnsubscribe']);
    
});

// Short redirect for unsubscribe tokens: /u/{token}
use App\Http\Controllers\UnsubscribeRedirectController;
Route::get('/u/{token}', [UnsubscribeRedirectController::class, 'redirect']);
Route::post('/u/{token}/confirm', [UnsubscribeRedirectController::class, 'confirm']);

Route::get('/debug-scheme', function (\Illuminate\Http\Request $r) {
    return ['secure' => $r->secure(), 'scheme' => $r->getScheme(), 'url' => url('/'), 'app_url' => config('app.url')];
});
// note: in production, ensure APP_URL is set correctly in .env