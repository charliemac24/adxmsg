<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\Contacts;
use App\Models\OptoutLogger;

/**
 * Class OptoutLoggerController
 *
 * Handles opt-out functionality for contacts.
 *
 * @package App\Http\Controllers
 */
class OptoutLoggerController extends Controller
{
    /**
     * Opt out a contact and log the action.
     *
     * @param int $contact_id
     * @param \Illuminate\Http\Request $request
     * @return \Illuminate\Http\JsonResponse
     */
    public function optout(Request $request, $contact_id)
    {
        // Find the contact
        $contact = Contacts::find($contact_id);
        if (!$contact) {
            return response()->json(['message' => 'Contact not found'], 404);
        }

        // Update is_subscribed to 0 (false)
        $contact->is_subscribed = 0;
        $contact->save();

        // Log the opt-out action
        OptoutLogger::create([
            'contact_id' => $contact->id,
            'reason'     => $request->input('reason'), // Optional: pass a reason in the request
        ]);

        return response()->json(['message' => 'Contact opted out and logged successfully.']);
    }
}
