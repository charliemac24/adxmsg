<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;
use App\Models\User;

class AdminUserSeeder extends Seeder
{
    public function run()
    {
        $email = 'admin';
        $user = User::where('email', $email)->orWhere('name', 'Administrator')->first();
        if (!$user) {
            User::create([
                'name' => 'Administrator',
                'email' => $email,
                'password' => Hash::make('admin123!'),
            ]);
        }
    }
}
