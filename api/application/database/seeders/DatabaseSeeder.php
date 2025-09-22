<?php

namespace Database\Seeders;

// use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    /**
     * Seed the application's database.
     *
     * @return void
     */
    public function run()
    {
    // Seed an initial admin user (name: Administrator, email: admin, password: admin123!)
    $this->call([\Database\Seeders\AdminUserSeeder::class]);
    }
}
