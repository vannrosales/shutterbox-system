<?php

namespace App\Http\Controllers;

use App\Models\Template;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class TemplateController extends Controller
{
    public function index(): Response
    {
        $templates = Template::withCount(['queueSessions', 'bookings'])->get();

        // Calculate detailed usage stats for "Best Template" report
        $totalSelections = 0;

        $templateReports = $templates->map(function ($t) use (&$totalSelections) {
            $queueCount = $t->queue_sessions_count;
            $bookingCount = $t->bookings_count;
            $count = $queueCount + $bookingCount;
            $totalSelections += $count;

            // Revenue estimated by proportional usage in sessions
            $queueRevenue = $t->queueSessions->sum('total_price');
            $bookingRevenue = $t->bookings->sum('total_amount');

            return [
                'id' => $t->id,
                'name' => $t->name,
                'code' => $t->code,
                'category' => $t->category,
                'preview_url' => $t->preview_url,
                'is_active' => $t->is_active,
                'total_usage' => $count,
                'queue_usage' => $queueCount,
                'booking_usage' => $bookingCount,
                'total_revenue' => $queueRevenue + $bookingRevenue,
            ];
        });

        // Calculate percentage share
        $templateReports = $templateReports->map(function ($item) use ($totalSelections) {
            $item['percentage'] = $totalSelections > 0 ? round(($item['total_usage'] / $totalSelections) * 100, 1) : 0;

            return $item;
        })->sortByDesc('total_usage')->values();

        $bestTemplate = $templateReports->first();

        return Inertia::render('templates/index', [
            'templates' => $templateReports,
            'bestTemplate' => $bestTemplate,
            'totalSelections' => $totalSelections,
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'code' => ['required', 'string', 'max:100', 'unique:templates,code'],
            'category' => ['required', 'string', 'max:100'],
            'preview_url' => ['nullable', 'string', 'max:255'],
        ]);

        Template::create([
            'name' => $validated['name'],
            'code' => strtoupper($validated['code']),
            'category' => $validated['category'],
            'preview_url' => $validated['preview_url'] ?? null,
            'is_active' => true,
        ]);

        return back()->with('success', 'New photostrip template created.');
    }

    public function toggleActive(Template $template): RedirectResponse
    {
        $template->update([
            'is_active' => ! $template->is_active,
        ]);

        return back()->with('success', 'Template status updated.');
    }
}
