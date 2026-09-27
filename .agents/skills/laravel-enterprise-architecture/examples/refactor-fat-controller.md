# Worked example: refactoring a fat controller

A real shape you will meet constantly. 118 lines in one method.

## Before

```php
class OrderController extends Controller
{
    public function refund(Request $request, $id)
    {
        $order = Order::find($id);

        if (!$order) {
            return response()->json(['error' => 'Not found'], 404);
        }

        if ($order->user_id != auth()->id() && !auth()->user()->is_admin) {
            return response()->json(['error' => 'Forbidden'], 403);
        }

        $request->validate([
            'amount' => 'required|numeric',
            'reason' => 'nullable',
        ]);

        if ($order->status != 'paid') {
            return response()->json(['error' => 'Order not refundable'], 422);
        }

        if ($order->created_at->diffInDays(now()) > 90) {
            return response()->json(['error' => 'Refund window closed'], 422);
        }

        if ($request->amount > $order->total) {
            return response()->json(['error' => 'Amount too large'], 422);
        }

        DB::beginTransaction();
        try {
            $stripe = new \Stripe\StripeClient(env('STRIPE_SECRET'));
            $refund = $stripe->refunds->create([
                'charge' => $order->charge_id,
                'amount' => $request->amount * 100,
            ]);

            $order->refunds()->create([
                'amount'    => $request->amount,
                'reference' => $refund->id,
                'reason'    => $request->reason,
            ]);

            foreach ($order->items as $item) {
                $product = Product::find($item->product_id);
                $product->stock = $product->stock + $item->quantity;
                $product->save();
            }

            $order->status = 'refunded';
            $order->save();

            Mail::to($order->user->email)->send(new RefundIssued($order, $request->amount));
            Http::post(config('services.slack.webhook'), ['text' => "Refund: {$order->id}"]);
            Cache::forget("user.{$order->user_id}.orders");

            DB::commit();
        } catch (\Exception $e) {
            DB::rollBack();
            Log::error($e->getMessage());
            return response()->json(['error' => 'Refund failed'], 500);
        }

        return response()->json($order);
    }
}
```

## What is actually wrong

| Problem | Consequence |
|---|---|
| `Order::find($id)` + manual 404 | Route-model binding does this; also no tenant scoping (**IDOR**) |
| Hand-rolled authz with `!=` | Loose comparison, admin bypass unaudited, no policy to test |
| Inline validation | Not reusable; `nullable` with no type; amount as float |
| Domain rules as HTTP guards | Unreachable from queue/command; refund rules exist only in HTTP |
| `env()` outside config | Returns `null` once config is cached in production |
| Stripe SDK inline | Untestable without hitting the network |
| N+1 in the stock loop | One query per item; also a lost-update race with no lock |
| Money as float × 100 | Rounding errors on real money |
| Mail + Slack + cache inline | Request latency tied to third parties; a Slack outage fails refunds |
| `catch (\Exception)` → 500 | Swallows the cause; the transaction wrapper duplicates `DB::transaction` |
| `return $order` | Leaks every column, including `charge_id` |

## After

**Route** — scoped binding closes the IDOR:

```php
Route::post('/orders/{order}/refund', RefundOrderController::class)
    ->middleware(['auth', 'throttle:refunds'])
    ->name('orders.refund');
```

**Form Request** — validation + authorization:

```php
final class RefundOrderRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()->can('refund', $this->route('order'));
    }

    public function rules(): array
    {
        return [
            'amount_minor' => ['required', 'integer', 'min:1', new NotExceedingOrderTotal($this->route('order'))],
            'reason'       => ['nullable', 'string', 'max:500'],
        ];
    }
}
```

**Policy** — authorization, now testable and reusable:

```php
final class OrderPolicy
{
    public function refund(User $user, Order $order): Response
    {
        if ($user->tenant_id !== $order->tenant_id) {
            return Response::denyAsNotFound();
        }

        return $user->id === $order->user_id || $user->hasPermission('orders.refund')
            ? Response::allow()
            : Response::deny(__('You cannot refund this order.'));
    }
}
```

**Model** — domain rules where every caller sees them:

```php
public function isRefundable(): bool
{
    return $this->status === OrderStatus::Paid
        && $this->placed_at->diffInDays(now()) <= 90;
}
```

**DTO**:

```php
final readonly class RefundOrderData
{
    public function __construct(
        public Money $amount,
        public int $actorId,
        public ?string $reason = null,
    ) {}

    public static function fromRequest(RefundOrderRequest $request): self
    {
        return new self(
            amount:  Money::fromMinor($request->integer('amount_minor'), $request->route('order')->currency),
            actorId: $request->user()->id,
            reason:  $request->string('reason')->toString() ?: null,
        );
    }
}
```

**Action** — the operation, callable from HTTP, queue, command, or test:

```php
final class RefundOrder
{
    public function __construct(
        private readonly PaymentGateway $gateway,
        private readonly RestoreStock $restoreStock,
    ) {}

    public function handle(Order $order, RefundOrderData $data): Refund
    {
        if (! $order->isRefundable()) {
            throw new OrderNotRefundable($order);
        }

        return DB::transaction(function () use ($order, $data): Refund {
            $refund = $this->gateway->refund($order->charge_id, $data->amount);

            $order->refunds()->create([
                'amount'       => $data->amount,
                'reference'    => $refund->reference,
                'reason'       => $data->reason,
                'requested_by' => $data->actorId,
            ]);

            $this->restoreStock->handle($order);
            $order->markRefunded();

            OrderRefunded::dispatch($order, $data->amount);

            return $refund;
        });
    }
}
```

**Stock restore** — one atomic statement instead of an N+1 loop with a race:

```php
final class RestoreStock
{
    public function handle(Order $order): void
    {
        $order->loadMissing('items');

        foreach ($order->items as $item) {
            Product::whereKey($item->product_id)->increment('stock', $item->quantity);
        }
    }
}
```

`increment()` compiles to `SET stock = stock + ?`, so concurrent refunds cannot lose an
update — unlike read-modify-write.

**Listeners** — the three consequences, now out of the request path:

```php
final class NotifyCustomerOfRefund implements ShouldQueue { /* mail */ }
final class PostRefundToSlack     implements ShouldQueue { /* webhook */ }
final class ForgetCachedOrders    implements ShouldQueue { /* cache */ }
```

**Exception rendering** — `bootstrap/app.php`, so the action stays HTTP-free:

```php
$exceptions->render(fn (OrderNotRefundable $e, Request $r) =>
    $r->expectsJson()
        ? response()->json(['message' => $e->getMessage()], 422)
        : back()->withErrors(['order' => $e->getMessage()])
);
```

**Controller** — 5 lines:

```php
final class RefundOrderController
{
    public function __invoke(RefundOrderRequest $request, Order $order, RefundOrder $refund): OrderResource
    {
        $refund->handle($order, RefundOrderData::fromRequest($request));

        return OrderResource::make($order->fresh());
    }
}
```

## What the refactor bought

- Refunds are now callable from an Artisan command and a queued job with zero changes.
- The Stripe call is behind `PaymentGateway`, so tests use a fake and run offline.
- Adding a fourth consequence touches one new listener, not the action.
- Slack being down no longer fails a refund.
- Money is integer minor units end to end.
- The response no longer leaks `charge_id`.
- Every piece is independently testable: policy, rule, action, listener.

## Cost, stated honestly

Nine files instead of one. That is the trade. It pays off at the second caller, the first
test, or the first change to the notification rules — which for a refund flow is
essentially immediate. For a one-off admin script touched once a year, it would not.
Apply judgement; the point is that this shape is the default for core business operations,
not that every endpoint needs nine files.
