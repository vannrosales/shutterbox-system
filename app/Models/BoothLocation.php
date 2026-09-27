<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class BoothLocation extends Model
{
    use HasFactory;

    protected $fillable = [
        'name',
        'address',
        'city',
        'start_date',
        'end_date',
        'rent_fee',
        'status',
        'notes',
    ];

    protected $casts = [
        'start_date' => 'datetime',
        'end_date' => 'datetime',
    ];

    public function bookings(): HasMany
    {
        return $this->hasMany(Booking::class);
    }

    public function queueSessions(): HasMany
    {
        return $this->hasMany(QueueSession::class);
    }

    public function expenses(): HasMany
    {
        return $this->hasMany(Expense::class);
    }
}
