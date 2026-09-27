<?php

namespace Database\Seeders;

use App\Models\BoothLocation;
use App\Models\Template;
use App\Models\User;
use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        if (! User::where('email', 'admin@shutterbox.com')->exists()) {
            User::factory()->create([
                'name' => 'Shutterbox Admin',
                'email' => 'admin@shutterbox.com',
            ]);
        }

        // 1. Templates
        $t1 = Template::create([
            'name' => '3 Shots - Black',
            'code' => 'TPL-3S-BLK',
            'category' => 'Black Frame',
            'preview_url' => '/images/templates/3s-black.png',
            'is_active' => true,
        ]);

        $t2 = Template::create([
            'name' => '4 Shots - Black',
            'code' => 'TPL-4S-BLK',
            'category' => 'Black Frame',
            'preview_url' => '/images/templates/4s-black.png',
            'is_active' => true,
        ]);

        $t3 = Template::create([
            'name' => '4 Shots - White',
            'code' => 'TPL-4S-WHT',
            'category' => 'White Frame',
            'preview_url' => '/images/templates/4s-white.png',
            'is_active' => true,
        ]);

        $t4 = Template::create([
            'name' => '3 Shots - B&W',
            'code' => 'TPL-3S-BNW',
            'category' => 'B&W Frame',
            'preview_url' => '/images/templates/3s-bnw.png',
            'is_active' => true,
        ]);

        // 2. Booth Event Location: RTR - Foundation Days (September 24 - 27, 2026)
        $b1 = BoothLocation::create([
            'name' => 'RTR - Foundation Days',
            'address' => 'RTR Main Campus Grounds',
            'city' => 'Tacloban City',
            'start_date' => '2026-09-24 08:00:00',
            'end_date' => '2026-09-27 22:00:00',
            'status' => 'active',
            'notes' => 'RTR Foundation Days Photo Booth Event station.',
        ]);

    }
}
