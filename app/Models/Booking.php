<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

class Booking extends Model
{
    use HasFactory;

    protected $fillable = [
        'booking_number',
        'client_name',
        'client_phone',
        'client_email',
        'booth_location_id',
        'event_name',
        'event_date',
        'start_time',
        'end_time',
        'sessions_count',
        'extra_copies',
        'base_amount',
        'extra_copies_amount',
        'total_amount',
        'deposit_amount',
        'status',
        'notes',
    ];

    protected $casts = [
        'event_date' => 'date:Y-m-d',
        'sessions_count' => 'integer',
        'extra_copies' => 'integer',
        'base_amount' => 'decimal:2',
        'extra_copies_amount' => 'decimal:2',
        'total_amount' => 'decimal:2',
        'deposit_amount' => 'decimal:2',
    ];

    public function boothLocation(): BelongsTo
    {
        return $this->belongsTo(BoothLocation::class);
    }

    public function templates(): BelongsToMany
    {
        return $this->belongsToMany(Template::class, 'booking_template');
    }
}
