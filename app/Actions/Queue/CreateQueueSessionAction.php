<?php

declare(strict_types=1);

namespace App\Actions\Queue;

use App\DTOs\QueueSessionData;
use App\Models\QueueSession;

final class CreateQueueSessionAction
{
    public function handle(QueueSessionData $data): QueueSession
    {
        $activeNumbers = QueueSession::whereIn('status', ['waiting', 'in_booth'])
            ->pluck('queue_number')
            ->map(function (string $num): int {
                if (preg_match('/(\d+)/', $num, $matches)) {
                    return (int) $matches[1];
                }

                return 0;
            })
            ->filter(fn (int $n): bool => $n > 0)
            ->toArray();

        $nextNum = 1;
        while (in_array($nextNum, $activeNumbers, true)) {
            $nextNum++;
        }

        $queueNumber = 'SB-'.str_pad((string) $nextNum, 3, '0', STR_PAD_LEFT);

        $queueSession = QueueSession::create([
            'queue_number' => $queueNumber,
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
            'status' => $data->status ?? 'waiting',
            'notes' => $data->notes,
        ]);

        $queueSession->templates()->sync($data->templateIds);

        return $queueSession;
    }
}
