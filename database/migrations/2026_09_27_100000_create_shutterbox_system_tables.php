<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('templates', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('code')->unique();
            $table->string('category')->default('Standard');
            $table->string('preview_url')->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });

        Schema::create('booth_locations', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('address')->nullable();
            $table->string('city')->nullable();
            $table->dateTime('start_date');
            $table->dateTime('end_date');
            $table->string('status')->default('active'); // active, upcoming, completed
            $table->text('notes')->nullable();
            $table->timestamps();
        });

        Schema::create('bookings', function (Blueprint $table) {
            $table->id();
            $table->string('booking_number')->unique();
            $table->string('client_name');
            $table->string('client_phone');
            $table->string('client_email')->nullable();
            $table->foreignId('booth_location_id')->nullable()->constrained('booth_locations')->nullOnDelete();
            $table->string('event_name');
            $table->date('event_date');
            $table->string('start_time')->default('10:00');
            $table->string('end_time')->default('18:00');
            $table->integer('sessions_count')->default(1);
            $table->integer('extra_copies')->default(0);
            $table->decimal('base_amount', 10, 2)->default(0.00);
            $table->decimal('extra_copies_amount', 10, 2)->default(0.00);
            $table->decimal('total_amount', 10, 2)->default(0.00);
            $table->decimal('deposit_amount', 10, 2)->default(0.00);
            $table->string('status')->default('scheduled'); // scheduled, in_progress, completed, cancelled
            $table->text('notes')->nullable();
            $table->timestamps();
        });

        Schema::create('queue_sessions', function (Blueprint $table) {
            $table->id();
            $table->string('queue_number')->unique();
            $table->string('customer_name')->default('Walk-in Guest');
            $table->foreignId('booth_location_id')->nullable()->constrained('booth_locations')->nullOnDelete();
            $table->integer('sessions_count')->default(1);
            $table->integer('photostrips_base_count')->default(2); // sessions_count * 2
            $table->integer('extra_copies')->default(0); // 100 per copy
            $table->integer('total_photostrips')->default(2);
            $table->decimal('base_price_per_session', 10, 2)->default(200.00);
            $table->decimal('base_total', 10, 2)->default(200.00);
            $table->decimal('extra_copies_price', 10, 2)->default(0.00);
            $table->decimal('total_price', 10, 2)->default(200.00);
            $table->string('payment_method')->default('cash'); // cash, gcash, card, maya
            $table->string('payment_status')->default('paid'); // paid, pending
            $table->string('status')->default('waiting'); // waiting, in_booth, completed, cancelled
            $table->text('notes')->nullable();
            $table->timestamps();
        });

        Schema::create('expenses', function (Blueprint $table) {
            $table->id();
            $table->foreignId('booth_location_id')->nullable()->constrained('booth_locations')->nullOnDelete();
            $table->string('category'); // Photo Paper Roll, Ink Cartridges, Booth Rental, Staff Pay, Transport, Utilities, Maintenance, Other
            $table->string('description');
            $table->decimal('amount', 10, 2);
            $table->date('expense_date');
            $table->string('receipt_number')->nullable();
            $table->timestamps();
        });

        Schema::create('queue_session_template', function (Blueprint $table) {
            $table->id();
            $table->foreignId('queue_session_id')->constrained('queue_sessions')->cascadeOnDelete();
            $table->foreignId('template_id')->constrained('templates')->cascadeOnDelete();
            $table->timestamps();
        });

        Schema::create('booking_template', function (Blueprint $table) {
            $table->id();
            $table->foreignId('booking_id')->constrained('bookings')->cascadeOnDelete();
            $table->foreignId('template_id')->constrained('templates')->cascadeOnDelete();
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('booking_template');
        Schema::dropIfExists('queue_session_template');
        Schema::dropIfExists('expenses');
        Schema::dropIfExists('queue_sessions');
        Schema::dropIfExists('bookings');
        Schema::dropIfExists('booth_locations');
        Schema::dropIfExists('templates');
    }
};
