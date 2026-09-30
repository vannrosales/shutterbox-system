<?php

namespace Tests\Feature;

use App\Http\Middleware\AutoAuthenticateOfflineUser;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Tests\TestCase;

class OfflineAutoLoginTest extends TestCase
{
    use RefreshDatabase;

    public function test_auto_login_middleware_authenticates_guest(): void
    {
        $this->assertGuest();

        $middleware = new AutoAuthenticateOfflineUser;
        $request = Request::create('/', 'GET');

        // Force env check to simulate non-testing environment
        app()->detectEnvironment(fn () => 'local');

        $middleware->handle($request, function ($req) {
            return response('OK');
        });

        $this->assertAuthenticated();
        $this->assertDatabaseHas('users', [
            'email' => 'admin@shutterbox.com',
        ]);
    }
}
