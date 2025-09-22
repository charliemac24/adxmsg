<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\User;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Auth;

class AuthController extends Controller
{
    // Login via username (name or email) + password. Returns a Sanctum token on success.
    public function login(Request $request)
    {
        $data = $request->validate([
            'username' => 'required|string',
            'password' => 'required|string',
        ]);

        $username = $data['username'];
        $password = $data['password'];

        $user = User::where('email', $username)->orWhere('name', $username)->first();
        if (!$user || !Hash::check($password, $user->password)) {
            return response()->json(['status' => 'error', 'message' => 'Invalid username or password'], 401);
        }

        // create token
        $token = $user->createToken('api-token')->plainTextToken;

        return response()->json(['status' => 'ok', 'token' => $token, 'user' => ['id' => $user->id, 'name' => $user->name, 'email' => $user->email]]);
    }

    // Logout: revoke current token
    public function logout(Request $request)
    {
        $user = $request->user();
        if ($user) {
            // revoke current token
            $request->user()->currentAccessToken()->delete();
        }
        return response()->json(['status' => 'ok']);
    }
}
