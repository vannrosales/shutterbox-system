<?php

use App\Http\Controllers\CalendarController;
use App\Http\Controllers\DashboardController;
use App\Http\Controllers\FinancialController;
use App\Http\Controllers\QueueController;
use App\Http\Controllers\TemplateController;
use Illuminate\Support\Facades\Route;

Route::get('/', function () {
    if (auth()->check()) {
        return redirect()->route('dashboard');
    }

    return Inertia\Inertia::render('welcome');
})->name('home');

Route::middleware(['auth'])->group(function () {
    Route::get('/dashboard', DashboardController::class)->name('dashboard');

    // Queuing POS
    Route::get('/queuing', [QueueController::class, 'index'])->name('queuing.index');
    Route::post('/queuing', [QueueController::class, 'store'])->name('queuing.store');
    Route::patch('/queuing/{queueSession}/status', [QueueController::class, 'updateStatus'])->name('queuing.update-status');
    Route::delete('/queuing/{queueSession}', [QueueController::class, 'destroy'])->name('queuing.destroy');

    // Calendar & Booth Locations / Bookings
    Route::get('/calendar', [CalendarController::class, 'index'])->name('calendar.index');
    Route::post('/calendar/booths', [CalendarController::class, 'storeBoothLocation'])->name('calendar.booths.store');
    Route::put('/calendar/booths/{boothLocation}', [CalendarController::class, 'updateBoothLocation'])->name('calendar.booths.update');
    Route::delete('/calendar/booths/{boothLocation}', [CalendarController::class, 'destroyBoothLocation'])->name('calendar.booths.destroy');
    Route::post('/calendar/bookings', [CalendarController::class, 'storeBooking'])->name('calendar.bookings.store');
    Route::patch('/calendar/bookings/{booking}/status', [CalendarController::class, 'updateBookingStatus'])->name('calendar.bookings.update-status');
    Route::delete('/calendar/bookings/{booking}', [CalendarController::class, 'destroyBooking'])->name('calendar.bookings.destroy');

    // Financial Tracker & Daily Gross Sales
    Route::get('/financials', [FinancialController::class, 'index'])->name('financials.index');
    Route::post('/financials/expenses', [FinancialController::class, 'storeExpense'])->name('financials.expenses.store');
    Route::delete('/financials/expenses/{expense}', [FinancialController::class, 'destroyExpense'])->name('financials.expenses.destroy');

    // Template Reports = Best Template
    Route::get('/templates', [TemplateController::class, 'index'])->name('templates.index');
    Route::post('/templates', [TemplateController::class, 'store'])->name('templates.store');
    Route::patch('/templates/{template}/toggle', [TemplateController::class, 'toggleActive'])->name('templates.toggle');
});

require __DIR__.'/settings.php';
