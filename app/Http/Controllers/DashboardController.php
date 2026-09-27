<?php

namespace App\Http\Controllers;

use App\Models\Booking;
use App\Models\BoothLocation;
use App\Models\QueueSession;
use App\Models\Template;
use Carbon\Carbon;
use Inertia\Inertia;
use Inertia\Response;

class DashboardController extends Controller
{
    public function __invoke(): Response
    {
        $today = Carbon::today();

        // 1. Daily Gross Sales
        $todayQueue = QueueSession::whereDate('created_at', $today)->where('payment_status', 'paid')->get();
        $todayBookings = Booking::whereDate('event_date', $today)->where('status', '!=', 'cancelled')->get();
        $todaySales = $todayQueue->sum('total_price') + $todayBookings->sum('total_amount');
        $todaySessions = $todayQueue->sum('sessions_count');
        $todayStrips = $todayQueue->sum('total_photostrips');

        // 2. Queue live status
        $waitingCount = QueueSession::where('status', 'waiting')->count();
        $inBoothCount = QueueSession::where('status', 'in_booth')->count();

        // 3. Active Booth Event Location
        $activeBooth = BoothLocation::where('status', 'active')->latest()->first();

        // 4. Best Template
        $topTemplate = Template::withCount('queueSessions')
            ->orderBy('queue_sessions_count', 'desc')
            ->first();

        // 5. Recent Queue Sessions
        $recentSessions = QueueSession::with('templates')->latest()->take(5)->get();

        // 6. Upcoming Bookings
        $upcomingBookings = Booking::whereDate('event_date', '>=', $today)
            ->where('status', 'scheduled')
            ->orderBy('event_date', 'asc')
            ->take(5)
            ->get();

        return Inertia::render('dashboard', [
            'metrics' => [
                'today_gross_sales' => $todaySales,
                'today_sessions' => $todaySessions,
                'today_photostrips' => $todayStrips,
                'waiting_queue' => $waitingCount,
                'in_booth_queue' => $inBoothCount,
            ],
            'activeBooth' => $activeBooth,
            'topTemplate' => $topTemplate,
            'recentSessions' => $recentSessions,
            'upcomingBookings' => $upcomingBookings,
        ]);
    }
}
