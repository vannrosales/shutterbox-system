<?php

declare(strict_types=1);

namespace App\Actions\Queue;

use App\DTOs\QueueSessionData;
use App\Models\QueueSession;

final class UpdateQueueSessionAction
{
    public function handle(QueueSession $queueSession, QueueSessionData $data): QueueSession
    {
        $queueSession->update([
            'customer_name' => $data->customerName,
            'booth_location_id' => $data->boothLocationId,
            'sessions_count' => $data->sessionsCount,
            'photostrips_base_count' => $data->photostripsBaseCount,
            'extra_copies' => $data->extraCopies,
            'total_photostrips' => $data->totalPhotostrips,
            'base_price_per_session' => $data->basePricePerSession,
            'base_total' => $data->baseTotal,
            'extra_copies_price' => $data->extraCopiesPrice,
            'total_price' => $data->totalPrice,
            'payment_method' => $data->paymentMethod,
            'payment_status' => $data->paymentStatus,
            'status' => $data->status ?? $queueSession->status,
            'notes' => $data->notes,
        ]);

        $queueSession->templates()->sync($data->templateIds);

        return $queueSession;
    }
}
