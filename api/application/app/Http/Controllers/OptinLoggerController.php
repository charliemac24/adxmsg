<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\Contacts;
use App\Models\OptinLogger;

/**
 * Class OptinLoggerController
 *
 * Handles opt-in functionality for contacts.
 *
 * @package App\Http\Controllers
 */
class OptinLoggerController extends Controller
{
    /**
     * Opt in a contact and log the action.
     *
     * @param \Illuminate\Http\Request $request
     * @param int $contact_id
     * @return \Illuminate\Http\JsonResponse
     */
    public function optin(Request $request, $contact_id)
    {
        // Find the contact
        $contact = Contacts::find($contact_id);
        if (!$contact) {
            return response()->json(['message' => 'Contact not found'], 404);
        }

        // Update is_subscribed to 1 (true)
        $contact->is_subscribed = 1;
        $contact->save();

        // Log the opt-in action
        OptinLogger::create([
            'contact_id' => $contact->id,
            'reason'     => $request->input('reason'), // Optional: pass a reason in the request
        ]);

        return response()->json(['message' => 'Contact opted in and logged successfully.']);
    }
}
