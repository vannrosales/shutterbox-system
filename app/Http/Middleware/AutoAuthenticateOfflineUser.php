<?php

namespace App\Http\Middleware;

use App\Models\User;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Symfony\Component\HttpFoundation\Response;

class AutoAuthenticateOfflineUser
{
    /**
     * Handle an incoming request.
     *
     * @param  Closure(Request): (Response)  $next
     */
    public function handle(Request $request, Closure $next): Response
    {
        if (Auth::guest() && ! app()->environment('testing')) {
            $user = User::firstOrCreate(
                ['email' => 'admin@shutterbox.com'],
                [
                    'name' => 'Shutterbox Admin',
                    'password' => bcrypt('shutterbox-offline-pass'),
                ]
            );

            Auth::login($user, remember: true);
        }

        return $next($request);
    }
}
