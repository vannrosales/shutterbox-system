<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Actions\Queue\CreateQueueSessionAction;
use App\Actions\Queue\UpdateQueueSessionAction;
use App\DTOs\QueueSessionData;
use App\Http\Requests\StoreQueueSessionRequest;
use App\Http\Requests\UpdateQueueSessionRequest;
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
                WHEN 'in_booth' THEN 1 
                WHEN 'waiting' THEN 2 
                WHEN 'skipped' THEN 3 
                WHEN 'completed' THEN 4 
                WHEN 'refunded' THEN 5
                WHEN 'cancelled' THEN 6 
                ELSE 7 END")
            ->orderBy('id', 'asc')
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

    public function display(): Response
    {
        $sessions = QueueSession::with(['templates', 'boothLocation'])
            ->whereDate('created_at', Carbon::today())
            ->whereIn('status', ['waiting', 'in_booth', 'completed', 'skipped'])
            ->orderByRaw("CASE status WHEN 'in_booth' THEN 1 WHEN 'waiting' THEN 2 WHEN 'skipped' THEN 3 ELSE 4 END")
            ->orderBy('id', 'asc')
            ->get();

        $activeBooth = BoothLocation::where('status', 'active')->first();

        return Inertia::render('queuing/display', [
            'sessions' => $sessions,
            'activeBooth' => $activeBooth,
        ]);
    }

    public function store(StoreQueueSessionRequest $request, CreateQueueSessionAction $action): RedirectResponse
    {
        $data = QueueSessionData::fromRequest($request);
        $queueSession = $action->handle($data);

        return back()->with('success', "Queue entry {$queueSession->queue_number} created successfully!");
    }

    public function update(UpdateQueueSessionRequest $request, QueueSession $queueSession, UpdateQueueSessionAction $action): RedirectResponse
    {
        $data = QueueSessionData::fromRequest($request);
        $updatedSession = $action->handle($queueSession, $data);

        return back()->with('success', "Queue ticket {$updatedSession->queue_number} updated successfully!");
    }

    public function updateStatus(Request $request, QueueSession $queueSession): RedirectResponse
    {
        $validated = $request->validate([
            'status' => ['required', 'string', 'in:waiting,in_booth,completed,cancelled,skipped,refunded'],
        ]);

        $updateData = ['status' => $validated['status']];

        if (in_array($validated['status'], ['cancelled', 'refunded'], true)) {
            $updateData['payment_status'] = 'refunded';
        } else {
            $updateData['payment_status'] = 'paid';
        }

        $queueSession->update($updateData);

        return back()->with('success', "Queue ticket {$queueSession->queue_number} status updated to {$validated['status']}.");
    }

    public function destroy(QueueSession $queueSession): RedirectResponse
    {
        $queueSession->delete();

        return back()->with('success', 'Queue entry removed.');
    }
}
