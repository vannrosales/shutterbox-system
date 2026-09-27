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
