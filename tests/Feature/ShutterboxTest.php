<?php

namespace Tests\Feature;

use App\Models\BoothLocation;
use App\Models\QueueSession;
use App\Models\Template;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ShutterboxTest extends TestCase
{
    use RefreshDatabase;

    public function test_authenticated_user_can_access_queuing_pos()
    {
        $user = User::factory()->create();
        $this->actingAs($user);

        $response = $this->get(route('queuing.index'));
        $response->assertOk();
    }

    public function test_can_create_queue_session_with_exact_business_rules()
    {
        $user = User::factory()->create();
        $template = Template::create([
            'name' => '3 Shots - Black',
            'code' => 'TPL-3S-BLK',
            'category' => 'Black Frame',
            'is_active' => true,
        ]);

        $this->actingAs($user);

        // 2 sessions = 4 photostrips (₱100*2 = ₱200) + 2 extra copies (= 4 photostrips, ₱100*2 = ₱200) => Total = 8 strips, ₱400
        $response = $this->post(route('queuing.store'), [
            'customer_name' => 'John Doe',
            'sessions_count' => 2,
            'template_ids' => [$template->id],
            'extra_copies' => 2,
            'payment_method' => 'gcash',
            'payment_status' => 'paid',
        ]);

        $response->assertRedirect();

        $this->assertDatabaseHas('queue_sessions', [
            'customer_name' => 'John Doe',
            'queue_number' => '001',
            'sessions_count' => 2,
            'photostrips_base_count' => 4,
            'extra_copies' => 2,
            'total_photostrips' => 8,
            'base_total' => 200.00,
            'extra_copies_price' => 200.00,
            'total_price' => 400.00,
            'payment_method' => 'gcash',
        ]);
    }

    public function test_authenticated_user_can_access_calendar_financials_and_templates()
    {
        $user = User::factory()->create();
        $this->actingAs($user);

        $this->get(route('calendar.index'))->assertOk();
        $this->get(route('financials.index'))->assertOk();
        $this->get(route('templates.index'))->assertOk();
    }

    public function test_financial_tracker_can_be_filtered_by_event_booth_location()
    {
        $user = User::factory()->create();
        $booth = BoothLocation::create([
            'name' => 'SM Megamall Booth',
            'address' => 'EDSA',
            'city' => 'Mandaluyong',
            'start_date' => now(),
            'end_date' => now()->addDays(2),
            'status' => 'active',
        ]);

        $this->actingAs($user);

        $response = $this->get(route('financials.index', ['booth_location_id' => $booth->id]));
        $response->assertOk();
        $response->assertInertia(fn ($page) => $page
            ->component('financials/index')
            ->where('selectedBoothId', (string) $booth->id)
        );
    }

    public function test_template_selection_count_is_validated_against_sessions_count()
    {
        $user = User::factory()->create();
        $t1 = Template::create(['name' => '3 Shots - Black', 'code' => 'T1', 'category' => 'Black', 'is_active' => true]);
        $t2 = Template::create(['name' => '4 Shots - Black', 'code' => 'T2', 'category' => 'Black', 'is_active' => true]);

        $this->actingAs($user);

        // 1 session with 2 templates selected should fail validation
        $response = $this->post(route('queuing.store'), [
            'customer_name' => 'Jane Doe',
            'sessions_count' => 1,
            'template_ids' => [$t1->id, $t2->id],
            'extra_copies' => 0,
            'payment_method' => 'cash',
            'payment_status' => 'paid',
        ]);

        $response->assertSessionHasErrors('template_ids');
    }

    public function test_can_update_queue_session()
    {
        $user = User::factory()->create();
        $t1 = Template::create(['name' => '3 Shots - Black', 'code' => 'T1', 'category' => 'Black', 'is_active' => true]);
        $t2 = Template::create(['name' => '4 Shots - Black', 'code' => 'T2', 'category' => 'Black', 'is_active' => true]);

        $session = QueueSession::create([
            'queue_number' => '001',
            'customer_name' => 'Alice',
            'sessions_count' => 1,
            'photostrips_base_count' => 2,
            'extra_copies' => 0,
            'total_photostrips' => 2,
            'base_price_per_session' => 100.00,
            'base_total' => 100.00,
            'extra_copies_price' => 0.00,
            'total_price' => 100.00,
            'payment_method' => 'cash',
            'payment_status' => 'paid',
            'status' => 'waiting',
        ]);
        $session->templates()->sync([$t1->id]);

        $this->actingAs($user);

        // Update to 2 sessions with 2 templates and 1 extra copy set
        $response = $this->put(route('queuing.update', $session), [
            'customer_name' => 'Alice Updated',
            'sessions_count' => 2,
            'template_ids' => [$t1->id, $t2->id],
            'extra_copies' => 1,
            'payment_method' => 'gcash',
            'payment_status' => 'paid',
            'status' => 'in_booth',
        ]);

        $response->assertRedirect();

        $this->assertDatabaseHas('queue_sessions', [
            'id' => $session->id,
            'customer_name' => 'Alice Updated',
            'sessions_count' => 2,
            'extra_copies' => 1,
            'total_photostrips' => 6, // 4 base + 2 extra
            'total_price' => 300.00, // 200 base + 100 extra
            'payment_method' => 'gcash',
            'status' => 'in_booth',
        ]);
    }

    public function test_recycles_queue_number_to_001_when_active_queue_is_cleared()
    {
        $user = User::factory()->create();
        $t1 = Template::create(['name' => '3 Shots - Black', 'code' => 'T1', 'category' => 'Black', 'is_active' => true]);

        // Create completed session 001
        $completedSession = QueueSession::create([
            'queue_number' => '001',
            'customer_name' => 'First Customer',
            'sessions_count' => 1,
            'photostrips_base_count' => 2,
            'extra_copies' => 0,
            'total_photostrips' => 2,
            'base_price_per_session' => 100.00,
            'base_total' => 100.00,
            'extra_copies_price' => 0.00,
            'total_price' => 100.00,
            'payment_method' => 'cash',
            'payment_status' => 'paid',
            'status' => 'completed',
        ]);

        $this->actingAs($user);

        // When a new customer arrives, since active queue is empty, next number should recycle back to 001
        $response = $this->post(route('queuing.store'), [
            'customer_name' => 'Next Customer',
            'sessions_count' => 1,
            'template_ids' => [$t1->id],
            'extra_copies' => 0,
            'payment_method' => 'cash',
            'payment_status' => 'paid',
        ]);

        $response->assertRedirect();

        $this->assertDatabaseHas('queue_sessions', [
            'customer_name' => 'Next Customer',
            'queue_number' => '001',
            'status' => 'waiting',
        ]);
    }
}
