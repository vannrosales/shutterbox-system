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
        $selectedDateStr = is_string($request->query('date')) ? $request->query('date') : Carbon::today()->format('Y-m-d');
        $selectedDate = Carbon::parse($selectedDateStr);
        $rawBoothId = $request->query('booth_location_id', 'all');
        $selectedBoothId = is_string($rawBoothId) ? $rawBoothId : (is_numeric($rawBoothId) ? (string) $rawBoothId : 'all');

        // Daily Gross Sales calculation
        $queueTodayQuery = QueueSession::whereDate('created_at', $selectedDate)
            ->where('payment_status', 'paid');

        $bookingsTodayQuery = Booking::whereDate('event_date', $selectedDate)
            ->where('status', '!=', 'cancelled');

        if ($selectedBoothId !== 'all' && ! empty($selectedBoothId)) {
            $queueTodayQuery->where('booth_location_id', $selectedBoothId);
            $bookingsTodayQuery->where('booth_location_id', $selectedBoothId);
        }

        $queueSessionsToday = $queueTodayQuery->get();
        $bookingsToday = $bookingsTodayQuery->get();

        $queueGrossSalesToday = $queueSessionsToday->sum('total_price');
        $queueSessionsCountToday = $queueSessionsToday->sum('sessions_count');
        $queuePhotostripsCountToday = $queueSessionsToday->sum('total_photostrips');
        $queueExtraCopiesToday = $queueSessionsToday->sum('extra_copies');
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

        $monthQueueQuery = QueueSession::whereBetween('created_at', [$startOfMonth, $endOfMonth])
            ->where('payment_status', 'paid');

        $monthBookingQuery = Booking::whereBetween('event_date', [$startOfMonth, $endOfMonth])
            ->where('status', '!=', 'cancelled');

        $monthExpensesQuery = Expense::whereBetween('expense_date', [$startOfMonth, $endOfMonth]);

        $expensesListQuery = Expense::with('boothLocation')
            ->orderBy('expense_date', 'desc')
            ->orderBy('id', 'desc');

        if ($selectedBoothId !== 'all' && ! empty($selectedBoothId)) {
            $monthQueueQuery->where('booth_location_id', $selectedBoothId);
            $monthBookingQuery->where('booth_location_id', $selectedBoothId);
            $monthExpensesQuery->where('booth_location_id', $selectedBoothId);
            $expensesListQuery->where('booth_location_id', $selectedBoothId);
        }

        $monthQueueSales = $monthQueueQuery->sum('total_price');
        $monthBookingSales = $monthBookingQuery->sum('total_amount');
        $totalMonthGrossSales = $monthQueueSales + $monthBookingSales;

        $monthExpenses = $monthExpensesQuery->get();
        $totalMonthExpenses = $monthExpenses->sum('amount');
        $netMonthIncome = $totalMonthGrossSales - $totalMonthExpenses;

        $expensesList = $expensesListQuery->get();
        $boothLocations = BoothLocation::orderBy('name')->get();

        return Inertia::render('financials/index', [
            'selectedDate' => $selectedDateStr,
            'selectedBoothId' => $selectedBoothId,
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
