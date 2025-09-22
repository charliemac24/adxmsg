<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\UnsubscribeRedirect;
use App\Models\Contacts;

class UnsubscribeRedirectController extends Controller
{
    // Show confirmation page for unsubscribe (GET)
    public function redirect($token)
    {
        $r = UnsubscribeRedirect::where('token', $token)->first();
        if (!$r) abort(404);

        return view('unsubscribe_confirm', ['token' => $token, 'target' => $r->target_url]);
    }

    // Handle confirmation (POST) and perform unsubscribe then redirect
    public function confirm($token)
    {
        $r = UnsubscribeRedirect::where('token', $token)->first();
        if (!$r) abort(404);

        if ($r->contact_id) {
            $c = Contacts::find($r->contact_id);
            if ($c) {
                $c->is_subscribed = 0;
                $c->save();
            }
        }

        return redirect()->away($r->target_url);
    }
}
