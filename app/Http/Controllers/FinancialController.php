<?php

namespace App\Http\Controllers;

use App\Http\Requests\StoreExpenseRequest;
use App\Models\Booking;
use App\Models\BoothLocation;
use App\Models\Expense;
use App\Models\QueueSession;
use Carbon\Carbon;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class FinancialController extends Controller
{
    public function index(Request $request): Response
    {
        $selectedDateStr = $request->query('date', Carbon::today()->format('Y-m-d'));
        $selectedDate = Carbon::parse($selectedDateStr);

        // Daily Gross Sales calculation
        $queueSessionsToday = QueueSession::whereDate('created_at', $selectedDate)
            ->where('payment_status', 'paid')
            ->get();

        $queueGrossSalesToday = $queueSessionsToday->sum('total_price');
        $queueSessionsCountToday = $queueSessionsToday->sum('sessions_count');
        $queuePhotostripsCountToday = $queueSessionsToday->sum('total_photostrips');
        $queueExtraCopiesToday = $queueSessionsToday->sum('extra_copies');

        $bookingsToday = Booking::whereDate('event_date', $selectedDate)
            ->where('status', '!=', 'cancelled')
            ->get();
        $bookingsGrossSalesToday = $bookingsToday->sum('total_amount');

        $totalDailyGrossSales = $queueGrossSalesToday + $bookingsGrossSalesToday;

        // Payment Method breakdown today
        $paymentMethods = [
            'cash' => $queueSessionsToday->where('payment_method', 'cash')->sum('total_price'),
            'gcash' => $queueSessionsToday->where('payment_method', 'gcash')->sum('total_price'),
            'maya' => $queueSessionsToday->where('payment_method', 'maya')->sum('total_price'),
            'card' => $queueSessionsToday->where('payment_method', 'card')->sum('total_price'),
        ];

        // Overall / Monthly Financial Tracker
        $startOfMonth = $selectedDate->copy()->startOfMonth();
        $endOfMonth = $selectedDate->copy()->endOfMonth();

        $monthQueueSales = QueueSession::whereBetween('created_at', [$startOfMonth, $endOfMonth])
            ->where('payment_status', 'paid')
            ->sum('total_price');

        $monthBookingSales = Booking::whereBetween('event_date', [$startOfMonth, $endOfMonth])
            ->where('status', '!=', 'cancelled')
            ->sum('total_amount');

        $totalMonthGrossSales = $monthQueueSales + $monthBookingSales;

        $monthExpenses = Expense::whereBetween('expense_date', [$startOfMonth, $endOfMonth])
            ->get();
        $totalMonthExpenses = $monthExpenses->sum('amount');

        $netMonthIncome = $totalMonthGrossSales - $totalMonthExpenses;

        // All expenses for list
        $expensesList = Expense::with('boothLocation')
            ->orderBy('expense_date', 'desc')
            ->orderBy('id', 'desc')
            ->get();

        $boothLocations = BoothLocation::where('status', 'active')->get();

        return Inertia::render('financials/index', [
            'selectedDate' => $selectedDateStr,
            'dailyStats' => [
                'gross_sales' => $totalDailyGrossSales,
                'queue_sales' => $queueGrossSalesToday,
                'booking_sales' => $bookingsGrossSalesToday,
                'sessions_count' => $queueSessionsCountToday,
                'photostrips_count' => $queuePhotostripsCountToday,
                'extra_copies_count' => $queueExtraCopiesToday,
                'transactions_count' => $queueSessionsToday->count() + $bookingsToday->count(),
                'payment_methods' => $paymentMethods,
            ],
            'monthlyStats' => [
                'gross_sales' => $totalMonthGrossSales,
                'expenses' => $totalMonthExpenses,
                'net_income' => $netMonthIncome,
            ],
            'expenses' => $expensesList,
            'boothLocations' => $boothLocations,
            'recentQueueTransactions' => $queueSessionsToday,
        ]);
    }

    public function storeExpense(StoreExpenseRequest $request): RedirectResponse
    {
        $validated = $request->validated();

        Expense::create($validated);

        return back()->with('success', 'Expense recorded successfully.');
    }

    public function destroyExpense(Expense $expense): RedirectResponse
    {
        $expense->delete();

        return back()->with('success', 'Expense record removed.');
    }
}
