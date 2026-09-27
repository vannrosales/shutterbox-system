<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Http\Requests\StoreBoothLocationRequest;
use App\Models\BoothLocation;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class EventController extends Controller
{
    public function index(): Response
    {
        $events = BoothLocation::orderBy('start_date', 'desc')->get();

        $stats = [
            'total_events' => $events->count(),
            'active_events' => $events->where('status', 'active')->count(),
            'upcoming_events' => $events->where('status', 'upcoming')->count(),
            'completed_events' => $events->where('status', 'completed')->count(),
            'inactive_events' => $events->where('status', 'inactive')->count(),
        ];

        return Inertia::render('events/index', [
            'events' => $events,
            'stats' => $stats,
        ]);
    }

    public function store(StoreBoothLocationRequest $request): RedirectResponse
    {
        $validated = $request->validated();

        BoothLocation::create($validated);

        return back()->with('success', 'Booth location event created successfully.');
    }

    public function update(Request $request, BoothLocation $boothLocation): RedirectResponse
    {
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'address' => ['nullable', 'string', 'max:255'],
            'city' => ['nullable', 'string', 'max:100'],
            'rent_fee' => ['nullable', 'numeric', 'min:0'],
            'start_date' => ['required', 'date'],
            'end_date' => ['required', 'date', 'after_or_equal:start_date'],
            'status' => ['required', 'string', 'in:active,upcoming,completed,inactive'],
            'notes' => ['nullable', 'string', 'max:1000'],
        ]);

        $boothLocation->update($validated);

        return back()->with('success', 'Booth location event updated successfully.');
    }

    public function toggleStatus(Request $request, BoothLocation $boothLocation): RedirectResponse
    {
        $newStatus = $boothLocation->status === 'active' ? 'inactive' : 'active';
        
        $boothLocation->update([
            'status' => $newStatus,
        ]);

        return back()->with('success', "Event status changed to {$newStatus}.");
    }

    public function destroy(BoothLocation $boothLocation): RedirectResponse
    {
        $boothLocation->delete();

        return back()->with('success', 'Event location deleted successfully.');
    }
}
