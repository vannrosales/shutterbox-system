<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class StoreQueueSessionRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        $maxTemplates = max(1, (int) $this->input('sessions_count', 1));

        return [
            'customer_name' => ['nullable', 'string', 'max:255'],
            'booth_location_id' => ['nullable', 'exists:booth_locations,id'],
            'sessions_count' => ['required', 'integer', 'min:1', 'max:50'],
            'template_ids' => ['required', 'array', 'min:1', "max:{$maxTemplates}"],
            'template_ids.*' => ['exists:templates,id'],
            'extra_copies' => ['nullable', 'integer', 'min:0', 'max:100'],
            'payment_method' => ['required', 'string', 'in:cash,gcash,card,maya'],
            'payment_status' => ['required', 'string', 'in:paid,pending'],
            'notes' => ['nullable', 'string', 'max:1000'],
        ];
    }

    public function messages(): array
    {
        $maxTemplates = max(1, (int) $this->input('sessions_count', 1));

        return [
            'template_ids.required' => 'Please select at least one photostrip template.',
            'template_ids.min' => 'Please select at least one photostrip template.',
            'template_ids.max' => "You can select up to {$maxTemplates} template(s) for {$maxTemplates} session(s).",
            'sessions_count.min' => 'Minimum number of sessions is 1.',
        ];
    }
}
