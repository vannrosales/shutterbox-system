# Layer contracts

One direction of flow. Every arrow points down. If you need to point up, emit an event.

```
┌──────────────────────────────────────────────────────────────┐
│ Entrypoints:  HTTP Controller · Artisan Command · Job handler │
│               · Event Listener · Broadcast handler            │
└──────────────────────────────────────────────────────────────┘
                              ↓  DTO
┌──────────────────────────────────────────────────────────────┐
│ Application:  Action classes · Services                       │
│               orchestration, transactions, domain decisions   │
└──────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────┐
│ Domain:       Models · Value Objects · Enums · Domain Events  │
└──────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────┐
│ Infrastructure: Eloquent · Repositories · HTTP clients ·      │
│                 Filesystem · Cache · Queue · Mail             │
└──────────────────────────────────────────────────────────────┘
```

## Entrypoint layer

**Responsibility:** translate the outside world into a call to the application layer,
and translate the result back out.

Allowed:
- Resolve route-model bindings
- Delegate validation to a Form Request
- Delegate authorization to a Policy (via the Form Request's `authorize()` or
  `$this->authorize()`)
- Build a DTO from validated input
- Call exactly one action/service
- Return a Resource, a redirect, or a view

Forbidden:
- `if` statements on domain state (`if ($order->status === 'paid')`)
- Queries beyond route-model binding or a trivial lookup
- `DB::transaction`
- Mail, notifications, HTTP calls
- More than one action call for a single business operation — if you need two, the
  operation is one action that calls two

**Size heuristic:** a controller method over 15 lines is doing someone else's job.

```php
final class PublishPostController
{
    public function __invoke(PublishPostRequest $request, Post $post, PublishPost $publish): RedirectResponse
    {
        $publish->handle($post, PublishPostData::fromRequest($request));

        return to_route('posts.show', $post)->with('status', __('Post published.'));
    }
}
```

Console commands and job handlers are the *same layer*. They must be equally thin — a
command that contains 80 lines of logic cannot be triggered from HTTP later without a
rewrite.

```php
final class PublishScheduledPosts extends Command
{
    protected $signature = 'posts:publish-scheduled';

    public function handle(PublishPost $publish): int
    {
        Post::dueForPublishing()->eachById(function (Post $post) use ($publish): void {
            $publish->handle($post, PublishPostData::scheduled());
        }, 500);

        return self::SUCCESS;
    }
}
```

## Application layer

**Responsibility:** the business operation. This is where the *decisions* are.

Owns:
- Transaction boundaries (`DB::transaction` belongs here, not in controllers or models)
- Ordering of steps
- Domain invariant enforcement that spans multiple models
- Dispatching events and jobs
- Calling infrastructure through injected abstractions

Contract:
- Input is a DTO or scalars/models — **never** `Illuminate\Http\Request`
- Output is a model, DTO, or `void` — never a `Response` or a view
- No knowledge of HTTP status codes, session, or flash messages
- Throws domain exceptions (`InsufficientStock`), not `abort(422)`

```php
final class RefundOrder
{
    public function __construct(
        private readonly PaymentGateway $gateway,
        private readonly StockAdjuster $stock,
    ) {}

    public function handle(Order $order, RefundOrderData $data): Refund
    {
        if (! $order->isRefundable()) {
            throw new OrderNotRefundable($order);      // domain exception, not abort()
        }

        return DB::transaction(function () use ($order, $data): Refund {
            $refund = $this->gateway->refund($order->charge_id, $data->amount);

            $order->refunds()->create([
                'amount'       => $data->amount,
                'reference'    => $refund->reference,
                'requested_by' => $data->actorId,
            ]);

            $this->stock->restore($order);
            $order->markRefunded();

            OrderRefunded::dispatch($order, $data->amount);   // consequences elsewhere

            return $refund;
        });
    }
}
```

Note what is *absent*: no email, no Slack ping, no cache flush. Those are consequences.
They live in listeners on `OrderRefunded`. Adding a fourth consequence later touches
zero lines of this class.

## Domain layer

Models, value objects, enums.

Models own:
- Relationships
- Casts (including custom casts to value objects)
- Query scopes (`scopeDueForPublishing`)
- Accessors/mutators for presentation-neutral derivation
- Small predicate methods that answer questions about *themselves*
  (`isRefundable()`, `hasVerifiedEmail()`)

Models must not:
- Send mail, dispatch notifications, call HTTP
- Coordinate other aggregates
- Contain `static::creating(fn () => /* 30 lines */)` — model events hide control flow;
  prefer explicit action steps. Reserve model events for genuinely universal concerns
  (setting a UUID, stamping a tenant id).

```php
final class Order extends Model
{
    protected $fillable = ['customer_id', 'currency'];   // never $guarded = []

    protected function casts(): array                    // Laravel 12 method form
    {
        return [
            'status'      => OrderStatus::class,
            'total'       => MoneyCast::class,
            'placed_at'   => 'immutable_datetime',
        ];
    }

    public function isRefundable(): bool
    {
        return $this->status === OrderStatus::Paid
            && $this->placed_at->diffInDays(now()) <= 90;
    }

    public function scopeForTenant(Builder $query, Tenant $tenant): void
    {
        $query->where('tenant_id', $tenant->id);
    }
}
```

## Infrastructure layer

Everything that talks to the world outside the process. Wrap third-party SDKs behind an
interface you own, so the vendor's shape does not leak into your application layer.

```php
interface PaymentGateway
{
    public function charge(Money $amount, string $token): ChargeResult;
    public function refund(string $chargeId, Money $amount): Refund;
}

final class StripeGateway implements PaymentGateway { /* ... */ }
```

Bind in a service provider:

```php
public function register(): void
{
    $this->app->singleton(PaymentGateway::class, StripeGateway::class);
}
```

This is the case where an interface earns its keep: a real second implementation exists
(the fake used in tests) and the vendor API is genuinely foreign. Contrast with wrapping
`User::find()`.

## Request lifecycle, annotated

1. `public/index.php` → `bootstrap/app.php` (Laravel 12: middleware, exceptions, routing
   all configured here)
2. Global middleware (trust proxies, CORS, session, CSRF)
3. Route resolution → route middleware (`auth`, `throttle`, custom)
4. Route-model binding — **scope bindings to the tenant/parent** to avoid IDOR:
   `Route::get('/teams/{team}/posts/{post}')->scopeBindings()`
5. Form Request: `authorize()` then `rules()` — failure short-circuits before the
   controller
6. Controller method — thin
7. Action/Service — business operation, transaction
8. Response: API Resource or view
9. Terminable middleware, then queued listeners/jobs run out-of-band

## Where things go — quick index

| Thing | Location |
|---|---|
| Validation rules for an endpoint | `app/Http/Requests/` |
| Reusable validation rule | `app/Rules/` |
| Business operation | `app/Actions/<Domain>/` |
| Multi-operation coordinator | `app/Services/<Domain>/` |
| Input shape | `app/DataTransferObjects/` (or `app/Data/`) |
| Self-validating scalar | `app/ValueObjects/` |
| Fixed set of states | `app/Enums/` |
| JSON output shape | `app/Http/Resources/` |
| Model authorization | `app/Policies/` |
| Non-model authorization | `AppServiceProvider::boot()` via `Gate::define` |
| Something happened | `app/Events/` |
| React to something | `app/Listeners/` |
| Deferred work | `app/Jobs/` |
| Third-party wrapper | `app/Support/<Vendor>/` or `app/Services/<Vendor>/` |
| Custom cast | `app/Casts/` |
| Domain exception | `app/Exceptions/<Domain>/` |

Pick one convention for DTO folder naming and never mix. If the project already uses
`app/Data`, use `app/Data`.
