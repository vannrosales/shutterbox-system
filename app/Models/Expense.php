<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Expense extends Model
{
    use HasFactory;

    protected $fillable = [
        'booth_location_id',
        'category',
        'description',
        'amount',
        'expense_date',
        'receipt_number',
    ];

    protected $casts = [
        'expense_date' => 'date:Y-m-d',
        'amount' => 'decimal:2',
    ];

    public function boothLocation(): BelongsTo
    {
        return $this->belongsTo(BoothLocation::class);
    }
}
