<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class StoreBookingRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        $maxTemplates = max(1, (int) $this->input('sessions_count', 1));

        return [
            'client_name' => ['required', 'string', 'max:255'],
            'client_phone' => ['required', 'string', 'max:50'],
            'client_email' => ['nullable', 'email', 'max:255'],
            'booth_location_id' => ['nullable', 'exists:booth_locations,id'],
            'event_name' => ['required', 'string', 'max:255'],
            'event_date' => ['required', 'date'],
            'start_time' => ['required', 'string'],
            'end_time' => ['required', 'string'],
            'sessions_count' => ['required', 'integer', 'min:1'],
            'extra_copies' => ['nullable', 'integer', 'min:0'],
            'deposit_amount' => ['nullable', 'numeric', 'min:0'],
            'template_ids' => ['nullable', 'array', "max:{$maxTemplates}"],
            'template_ids.*' => ['exists:templates,id'],
            'notes' => ['nullable', 'string', 'max:1000'],
        ];
    }
}
