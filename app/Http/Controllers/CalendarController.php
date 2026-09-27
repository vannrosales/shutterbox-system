<?php

namespace App\Http\Controllers;

use App\Http\Requests\StoreBookingRequest;
use App\Http\Requests\StoreBoothLocationRequest;
use App\Models\Booking;
use App\Models\BoothLocation;
use App\Models\Template;
use Carbon\Carbon;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class CalendarController extends Controller
{
    public function index(): Response
    {
        $boothLocations = BoothLocation::orderBy('start_date', 'asc')->get();
        $bookings = Booking::with(['templates', 'boothLocation'])->orderBy('event_date', 'asc')->get();
        $templates = Template::where('is_active', true)->get();

        return Inertia::render('calendar/index', [
            'boothLocations' => $boothLocations,
            'bookings' => $bookings,
            'templates' => $templates,
        ]);
    }

    public function storeBoothLocation(StoreBoothLocationRequest $request): RedirectResponse
    {
        $validated = $request->validated();

        BoothLocation::create($validated);

        return back()->with('success', 'Booth location created successfully.');
    }

    public function updateBoothLocation(Request $request, BoothLocation $boothLocation): RedirectResponse
    {
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'address' => ['nullable', 'string', 'max:255'],
            'city' => ['nullable', 'string', 'max:100'],
            'rent_fee' => ['nullable', 'numeric', 'min:0'],
            'start_date' => ['required', 'date'],
            'end_date' => ['required', 'date', 'after_or_equal:start_date'],
            'status' => ['required', 'string', 'in:active,upcoming,completed'],
            'notes' => ['nullable', 'string', 'max:1000'],
        ]);

        $boothLocation->update($validated);

        return back()->with('success', 'Booth location updated successfully.');
    }

    public function destroyBoothLocation(BoothLocation $boothLocation): RedirectResponse
    {
        $boothLocation->delete();

        return back()->with('success', 'Booth location deleted.');
    }

    public function storeBooking(StoreBookingRequest $request): RedirectResponse
    {
        $validated = $request->validated();

        $todayCount = Booking::whereYear('created_at', Carbon::now()->year)->count();
        $bookingNumber = 'BK-'.Carbon::now()->year.'-'.str_pad((string) ($todayCount + 1), 4, '0', STR_PAD_LEFT);

        $sessionsCount = (int) $validated['sessions_count'];
        $extraCopies = (int) ($validated['extra_copies'] ?? 0);

        // 1 session = 2 photostrips = ₱100
        $baseAmount = $sessionsCount * 100.00;
        $extraCopiesAmount = $extraCopies * 100.00;
        $totalAmount = $baseAmount + $extraCopiesAmount;
        $depositAmount = (float) ($validated['deposit_amount'] ?? 0.00);

        $booking = Booking::create([
            'booking_number' => $bookingNumber,
            'client_name' => $validated['client_name'],
            'client_phone' => $validated['client_phone'],
            'client_email' => $validated['client_email'] ?? null,
            'booth_location_id' => $validated['booth_location_id'] ?? null,
            'event_name' => $validated['event_name'],
            'event_date' => $validated['event_date'],
            'start_time' => $validated['start_time'],
            'end_time' => $validated['end_time'],
            'sessions_count' => $sessionsCount,
            'extra_copies' => $extraCopies,
            'base_amount' => $baseAmount,
            'extra_copies_amount' => $extraCopiesAmount,
            'total_amount' => $totalAmount,
            'deposit_amount' => $depositAmount,
            'status' => 'scheduled',
            'notes' => $validated['notes'] ?? null,
        ]);

        if (! empty($validated['template_ids'])) {
            $booking->templates()->sync($validated['template_ids']);
        }

        return back()->with('success', "Booking {$bookingNumber} created successfully!");
    }

    public function updateBookingStatus(Request $request, Booking $booking): RedirectResponse
    {
        $validated = $request->validate([
            'status' => ['required', 'string', 'in:scheduled,in_progress,completed,cancelled'],
        ]);

        $booking->update([
            'status' => $validated['status'],
        ]);

        return back()->with('success', "Booking status updated to {$validated['status']}.");
    }

    public function destroyBooking(Booking $booking): RedirectResponse
    {
        $booking->delete();

        return back()->with('success', 'Booking removed.');
    }
}
