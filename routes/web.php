<?php

use Illuminate\Support\Facades\Route;

Route::inertia('/', 'dashboard')->name('home');
Route::inertia('/dashboard', 'dashboard')->name('dashboard');

require __DIR__.'/settings.php';

