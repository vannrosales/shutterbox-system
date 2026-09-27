<?php

namespace Tests\Feature;

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
            'name' => 'Vintage Film 3-Strip',
            'code' => 'TPL-VINTAGE-01',
            'category' => 'Retro',
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
}
