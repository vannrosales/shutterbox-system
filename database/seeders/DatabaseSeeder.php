<?php

namespace Database\Seeders;

use App\Models\Booking;
use App\Models\BoothLocation;
use App\Models\Expense;
use App\Models\QueueSession;
use App\Models\Template;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        if (! User::where('email', 'test@example.com')->exists()) {
            User::factory()->create([
                'name' => 'Shutterbox Admin',
                'email' => 'test@example.com',
            ]);
        }

        // 1. Templates
        $t1 = Template::create([
            'name' => 'Vintage Film 3-Strip',
            'code' => 'TPL-VINTAGE-01',
            'category' => 'Retro & Film',
            'preview_url' => '/images/templates/vintage.png',
            'is_active' => true,
        ]);

        $t2 = Template::create([
            'name' => 'Pastel Hearts Dual',
            'code' => 'TPL-PASTEL-02',
            'category' => 'Cute & Pastel',
            'preview_url' => '/images/templates/pastel.png',
            'is_active' => true,
        ]);

        $t3 = Template::create([
            'name' => 'Minimalist Black & White',
            'code' => 'TPL-MINIMAL-03',
            'category' => 'Modern Minimal',
            'preview_url' => '/images/templates/minimal.png',
            'is_active' => true,
        ]);

        $t4 = Template::create([
            'name' => 'Cyber Neon Glow',
            'code' => 'TPL-NEON-04',
            'category' => 'Party & Glow',
            'preview_url' => '/images/templates/neon.png',
            'is_active' => true,
        ]);

        $t5 = Template::create([
            'name' => 'Classic Wedding Golden Frame',
            'code' => 'TPL-WEDDING-05',
            'category' => 'Formal Event',
            'preview_url' => '/images/templates/wedding.png',
            'is_active' => true,
        ]);

        // 2. Booth Locations
        $today = Carbon::today();

        $b1 = BoothLocation::create([
            'name' => 'SM Megamall Main Atrium Booth',
            'address' => 'EDSA cor Doña Julia Vargas Ave',
            'city' => 'Mandaluyong City',
            'start_date' => $today->copy()->subDays(2)->setHour(10)->setMinute(0),
            'end_date' => $today->copy()->addDays(5)->setHour(21)->setMinute(0),
            'status' => 'active',
            'notes' => 'Primary weekend booth setup next to central escalator.',
        ]);

        $b2 = BoothLocation::create([
            'name' => 'Glorietta 4 Activity Center',
            'address' => 'Ayala Center',
            'city' => 'Makati City',
            'start_date' => $today->copy()->addDays(2)->setHour(10)->setMinute(0),
            'end_date' => $today->copy()->addDays(7)->setHour(21)->setMinute(0),
            'status' => 'upcoming',
            'notes' => 'Pop-up booth for fashion week exhibition.',
        ]);

        // 3. Bookings (Calendar) - 1 session = ₱100
        $booking1 = Booking::create([
            'booking_number' => 'BK-2026-0001',
            'client_name' => 'Samantha Cruz',
            'client_phone' => '09171234567',
            'client_email' => 'samantha@example.com',
            'booth_location_id' => $b1->id,
            'event_name' => "Samantha's 18th Debut",
            'event_date' => $today->copy()->addDays(1)->format('Y-m-d'),
            'start_time' => '17:00',
            'end_time' => '21:00',
            'sessions_count' => 3,
            'extra_copies' => 4,
            'base_amount' => 300.00,
            'extra_copies_amount' => 400.00,
            'total_amount' => 700.00,
            'deposit_amount' => 500.00,
            'status' => 'scheduled',
            'notes' => 'Theme: Rose Gold & Vintage Film.',
        ]);
        $booking1->templates()->attach([$t1->id, $t2->id]);

        $booking2 = Booking::create([
            'booking_number' => 'BK-2026-0002',
            'client_name' => 'TechCorp PH',
            'client_phone' => '09189876543',
            'client_email' => 'events@techcorp.ph',
            'booth_location_id' => $b2->id,
            'event_name' => 'TechCorp Annual Summit 2026',
            'event_date' => $today->copy()->addDays(3)->format('Y-m-d'),
            'start_time' => '13:00',
            'end_time' => '18:00',
            'sessions_count' => 5,
            'extra_copies' => 10,
            'base_amount' => 500.00,
            'extra_copies_amount' => 1000.00,
            'total_amount' => 1500.00,
            'deposit_amount' => 1500.00,
            'status' => 'scheduled',
            'notes' => 'Requires custom Cyber Neon logo watermark.',
        ]);
        $booking2->templates()->attach([$t3->id, $t4->id]);

        // 4. Queue Sessions (POS / Walk-ins)
        // 1 session = 2 photostrips = ₱100
        // 1 extra copy = 2 photostrips = ₱100
        $q1 = QueueSession::create([
            'queue_number' => 'SB-001',
            'customer_name' => 'Marco Reyes',
            'booth_location_id' => $b1->id,
            'sessions_count' => 1,
            'photostrips_base_count' => 2,
            'extra_copies' => 0,
            'total_photostrips' => 2,
            'base_price_per_session' => 100.00,
            'base_total' => 100.00,
            'extra_copies_price' => 0.00,
            'total_price' => 100.00,
            'payment_method' => 'gcash',
            'payment_status' => 'paid',
            'status' => 'completed',
            'created_at' => $today->copy()->subHours(4),
        ]);
        $q1->templates()->attach([$t1->id]);

        $q2 = QueueSession::create([
            'queue_number' => 'SB-002',
            'customer_name' => 'Angela & Friends',
            'booth_location_id' => $b1->id,
            'sessions_count' => 2,
            'photostrips_base_count' => 4,
            'extra_copies' => 3, // +3 extra copy sets = 6 strips, +₱300
            'total_photostrips' => 10,
            'base_price_per_session' => 100.00,
            'base_total' => 200.00,
            'extra_copies_price' => 300.00,
            'total_price' => 500.00,
            'payment_method' => 'cash',
            'payment_status' => 'paid',
            'status' => 'completed',
            'created_at' => $today->copy()->subHours(2),
        ]);
        $q2->templates()->attach([$t1->id, $t2->id]);

        $q3 = QueueSession::create([
            'queue_number' => 'SB-003',
            'customer_name' => 'David Tan',
            'booth_location_id' => $b1->id,
            'sessions_count' => 1,
            'photostrips_base_count' => 2,
            'extra_copies' => 2, // +2 extra copy sets = 4 strips, +₱200
            'total_photostrips' => 6,
            'base_price_per_session' => 100.00,
            'base_total' => 100.00,
            'extra_copies_price' => 200.00,
            'total_price' => 300.00,
            'payment_method' => 'maya',
            'payment_status' => 'paid',
            'status' => 'in_booth',
            'created_at' => $today->copy()->subMinutes(15),
        ]);
        $q3->templates()->attach([$t3->id]);

        $q4 = QueueSession::create([
            'queue_number' => 'SB-004',
            'customer_name' => 'Patricia Lim',
            'booth_location_id' => $b1->id,
            'sessions_count' => 3,
            'photostrips_base_count' => 6,
            'extra_copies' => 5, // +5 extra copy sets = 10 strips, +₱500
            'total_photostrips' => 16,
            'base_price_per_session' => 100.00,
            'base_total' => 300.00,
            'extra_copies_price' => 500.00,
            'total_price' => 800.00,
            'payment_method' => 'cash',
            'payment_status' => 'paid',
            'status' => 'waiting',
            'created_at' => $today->copy()->subMinutes(5),
        ]);
        $q4->templates()->attach([$t1->id, $t2->id, $t4->id]);

        // 5. Expenses
        Expense::create([
            'booth_location_id' => $b1->id,
            'category' => 'Photo Paper Roll',
            'description' => 'DNP RX1 4x6 Premium Glossy Paper (2 Rolls)',
            'amount' => 3200.00,
            'expense_date' => $today->copy()->subDays(1)->format('Y-m-d'),
            'receipt_number' => 'OR-99481',
        ]);

        Expense::create([
            'booth_location_id' => $b1->id,
            'category' => 'Staff Allowance',
            'description' => 'Daily Booth Operator Allowance & Meals',
            'amount' => 800.00,
            'expense_date' => $today->format('Y-m-d'),
            'receipt_number' => 'VOUCHER-042',
        ]);
    }
}
