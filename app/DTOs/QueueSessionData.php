<?php

declare(strict_types=1);

namespace App\DTOs;

use App\Http\Requests\StoreQueueSessionRequest;
use App\Http\Requests\UpdateQueueSessionRequest;

final readonly class QueueSessionData
{
    /**
     * @param  array<int>  $templateIds
     */
    public function __construct(
        public ?string $customerName,
        public ?int $boothLocationId,
        public int $sessionsCount,
        public array $templateIds,
        public int $extraCopies,
        public string $paymentMethod,
        public string $paymentStatus,
        public ?string $status,
        public ?string $notes,
        public int $photostripsBaseCount,
        public int $extraPhotostripsCount,
        public int $totalPhotostrips,
        public float $basePricePerSession,
        public float $baseTotal,
        public float $extraCopiesPrice,
        public float $totalPrice,
    ) {}

    public static function fromRequest(StoreQueueSessionRequest|UpdateQueueSessionRequest $request): self
    {
        $validated = $request->validated();

        $sessionsCount = (int) $validated['sessions_count'];
        $extraCopies = (int) ($validated['extra_copies'] ?? 0);

        $photostripsBaseCount = $sessionsCount * 2;
        $extraPhotostripsCount = $extraCopies * 2;
        $totalPhotostrips = $photostripsBaseCount + $extraPhotostripsCount;

        $basePricePerSession = 100.00;
        $baseTotal = $sessionsCount * $basePricePerSession;
        $extraCopiesPrice = $extraCopies * 100.00;
        $totalPrice = $baseTotal + $extraCopiesPrice;

        return new self(
            customerName: $validated['customer_name'] ?: 'Walk-in Guest',
            boothLocationId: isset($validated['booth_location_id']) && $validated['booth_location_id'] !== '' ? (int) $validated['booth_location_id'] : null,
            sessionsCount: $sessionsCount,
            templateIds: array_map('intval', $validated['template_ids']),
            extraCopies: $extraCopies,
            paymentMethod: $validated['payment_method'],
            paymentStatus: $validated['payment_status'],
            status: $validated['status'] ?? 'waiting',
            notes: $validated['notes'] ?? null,
            photostripsBaseCount: $photostripsBaseCount,
            extraPhotostripsCount: $extraPhotostripsCount,
            totalPhotostrips: $totalPhotostrips,
            basePricePerSession: $basePricePerSession,
            baseTotal: $baseTotal,
            extraCopiesPrice: $extraCopiesPrice,
            totalPrice: $totalPrice,
        );
    }
}
