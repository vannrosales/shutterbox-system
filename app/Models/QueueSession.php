<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

class QueueSession extends Model
{
    use HasFactory;

    protected $fillable = [
        'queue_number',
        'customer_name',
        'booth_location_id',
        'sessions_count',
        'photostrips_base_count',
        'extra_copies',
        'total_photostrips',
        'base_price_per_session',
        'base_total',
        'extra_copies_price',
        'total_price',
        'payment_method',
        'payment_status',
        'status',
        'notes',
    ];

    protected $casts = [
        'sessions_count' => 'integer',
        'photostrips_base_count' => 'integer',
        'extra_copies' => 'integer',
        'total_photostrips' => 'integer',
        'base_price_per_session' => 'decimal:2',
        'base_total' => 'decimal:2',
        'extra_copies_price' => 'decimal:2',
        'total_price' => 'decimal:2',
    ];

    public function boothLocation(): BelongsTo
    {
        return $this->belongsTo(BoothLocation::class);
    }

    public function templates(): BelongsToMany
    {
        return $this->belongsToMany(Template::class, 'queue_session_template');
    }
}
