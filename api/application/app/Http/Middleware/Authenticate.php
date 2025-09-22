<?php

namespace App\Http\Middleware;

use Illuminate\Auth\Middleware\Authenticate as Middleware;

class Authenticate extends Middleware
{
    /**
     * Get the path the user should be redirected to when they are not authenticated.
     *
     * @param  \Illuminate\Http\Request  $request
     * @return string|null
     */
    protected function redirectTo($request)
    {
        // For API or AJAX requests we should not redirect to a login route
        // because that causes the browser to receive an HTML redirect during
        // an AJAX/OPTIONS request which breaks CORS/preflight. Return null so
        // the framework returns a JSON 401 for unauthenticated API calls.
        if ($request->is('api/*') || $request->is('v1/*') || $request->expectsJson()) {
            return null;
        }

        return route('login');
    }
}
