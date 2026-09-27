<?php

namespace App\Http\Controllers;

use App\Http\Requests\StoreQueueSessionRequest;
use App\Models\BoothLocation;
use App\Models\QueueSession;
use App\Models\Template;
use Carbon\Carbon;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class QueueController extends Controller
{
    public function index(): Response
    {
        $sessions = QueueSession::with(['templates', 'boothLocation'])
            ->orderByRaw("CASE status 
                WHEN 'waiting' THEN 1 
                WHEN 'in_booth' THEN 2 
                WHEN 'completed' THEN 3 
                WHEN 'cancelled' THEN 4 
                ELSE 5 END")
            ->orderBy('id', 'desc')
            ->get();

        $templates = Template::where('is_active', true)->get();
        $boothLocations = BoothLocation::where('status', 'active')->get();

        $todayStats = [
            'total_queue' => QueueSession::whereDate('created_at', Carbon::today())->count(),
            'completed_today' => QueueSession::whereDate('created_at', Carbon::today())->where('status', 'completed')->count(),
            'waiting_now' => QueueSession::where('status', 'waiting')->count(),
            'in_booth_now' => QueueSession::where('status', 'in_booth')->count(),
        ];

        return Inertia::render('queuing/index', [
            'sessions' => $sessions,
            'templates' => $templates,
            'boothLocations' => $boothLocations,
            'todayStats' => $todayStats,
        ]);
    }

    public function store(StoreQueueSessionRequest $request): RedirectResponse
    {
        $validated = $request->validated();

        $todayCount = QueueSession::whereDate('created_at', Carbon::today())->count();
        $queueNumber = 'SB-'.str_pad($todayCount + 1, 3, '0', STR_PAD_LEFT);

        $sessionsCount = (int) $validated['sessions_count'];
        $extraCopies = (int) ($validated['extra_copies'] ?? 0);

        // 1 session = 2 photostrips = ₱100
        // Extra copy = 2 photostrips = ₱100
        $photostripsBaseCount = $sessionsCount * 2;
        $extraPhotostripsCount = $extraCopies * 2;
        $totalPhotostrips = $photostripsBaseCount + $extraPhotostripsCount;

        $basePricePerSession = 100.00;
        $baseTotal = $sessionsCount * $basePricePerSession;
        $extraCopiesPrice = $extraCopies * 100.00;
        $totalPrice = $baseTotal + $extraCopiesPrice;

        $queueSession = QueueSession::create([
            'queue_number' => $queueNumber,
            'customer_name' => $validated['customer_name'] ?: 'Walk-in Guest',
            'booth_location_id' => $validated['booth_location_id'] ?? null,
            'sessions_count' => $sessionsCount,
            'photostrips_base_count' => $photostripsBaseCount,
            'extra_copies' => $extraCopies,
            'total_photostrips' => $totalPhotostrips,
            'base_price_per_session' => $basePricePerSession,
            'base_total' => $baseTotal,
            'extra_copies_price' => $extraCopiesPrice,
            'total_price' => $totalPrice,
            'payment_method' => $validated['payment_method'],
            'payment_status' => $validated['payment_status'],
            'status' => 'waiting',
            'notes' => $validated['notes'] ?? null,
        ]);

        $queueSession->templates()->sync($validated['template_ids']);

        return back()->with('success', "Queue entry {$queueNumber} created successfully!");
    }

    public function updateStatus(Request $request, QueueSession $queueSession): RedirectResponse
    {
        $validated = $request->validate([
            'status' => ['required', 'string', 'in:waiting,in_booth,completed,cancelled'],
        ]);

        $queueSession->update([
            'status' => $validated['status'],
        ]);

        return back()->with('success', "Queue status updated to {$validated['status']}.");
    }

    public function destroy(QueueSession $queueSession): RedirectResponse
    {
        $queueSession->delete();

        return back()->with('success', 'Queue entry removed.');
    }
}
