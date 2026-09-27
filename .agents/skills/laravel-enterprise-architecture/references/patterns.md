# Pattern catalogue

Each entry: what it is, when it earns its place, when it does not, worked example.

---

## Action class

**What:** one class, one public method, one business verb.

**Use when:** any business operation. This is the default unit.

**Do not:** give it a second public method. If you want one, you want a service.

```php
declare(strict_types=1);

namespace App\Actions\Orders;

final class RefundOrder
{
    public function __construct(
        private readonly PaymentGateway $gateway,
        private readonly StockAdjuster $stock,
    ) {}

    public function handle(Order $order, RefundOrderData $data): Refund
    {
        // ...
    }
}
```

Naming: `VerbNoun` — `RefundOrder`, `InviteTeamMember`, `RecalculateRanking`. Never
`OrderRefunder`, never `RefundOrderHandler`.

Invocation: constructor-inject it, or `app(RefundOrder::class)`. Do not make actions
`__invoke`-only if you also want them route-dispatchable — pick one convention project-wide.

**Composition:** actions may call other actions. That is not a layering violation; it is
how a large operation stays readable.

```php
public function handle(Order $order, RefundOrderData $data): Refund
{
    return DB::transaction(function () use ($order, $data) {
        $refund = $this->issueRefund->handle($order, $data->amount);
        $this->restoreStock->handle($order);
        return $refund;
    });
}
```

---

## Service class

**Use when:** 3+ related operations over one aggregate share meaningful private helpers
or state. `SubscriptionService` with `start/swap/cancel/resume` that all share
`assertPlanAvailable()` is legitimate.

**Do not:** create `UserService` because "users need a service". A noun-named class with
unrelated methods is a fat controller wearing a hat.

**Smell:** the class has more than ~7 public methods, or two methods share no private
helper. Split into actions.

---

## DTO (Data Transfer Object)

**What:** a typed, immutable bag of input.

**Why:** the boundary between "untrusted HTTP shape" and "typed domain input". A service
taking `array $data` cannot be statically analysed, refactored safely, or documented.

```php
declare(strict_types=1);

namespace App\DataTransferObjects;

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
            amount:  Money::fromMinor($request->integer('amount_minor'), $request->string('currency')),
            actorId: $request->user()->id,
            reason:  $request->string('reason')->toString() ?: null,
        );
    }
}
```

Rules:
- `final readonly class`, public promoted properties. No getters.
- Named constructors: `fromRequest`, `fromArray`, `fromModel`.
- No I/O, no queries, no container access inside a DTO.
- Derived values: PHP 8.4 property hooks.

```php
final readonly class InvoiceLineData
{
    public function __construct(
        public Money $unitPrice,
        public int $quantity,
    ) {}

    public Money $subtotal {
        get => $this->unitPrice->multipliedBy($this->quantity);
    }
}
```

If the project uses `spatie/laravel-data`, use it consistently rather than hand-rolling
half the DTOs.

---

## Value object

**What:** a small type that makes invalid state unrepresentable, compared by value.

**Use when:** a scalar has rules (`EmailAddress`, `Money`, `Slug`, `PhilippineMobileNumber`,
`Percentage`). Anywhere you'd otherwise pass a naked `string` and validate it in four places.

```php
final readonly class Money
{
    private function __construct(
        public int $minorUnits,
        public Currency $currency,
    ) {}

    public static function fromMinor(int $minorUnits, string $currency): self
    {
        if ($minorUnits < 0) {
            throw new InvalidArgumentException('Money cannot be negative.');
        }

        return new self($minorUnits, Currency::from(strtoupper($currency)));
    }

    public function plus(self $other): self
    {
        $this->assertSameCurrency($other);
        return new self($this->minorUnits + $other->minorUnits, $this->currency);
    }

    public function equals(self $other): bool
    {
        return $this->minorUnits === $other->minorUnits
            && $this->currency === $other->currency;
    }
}
```

**Never store money as float.** Integer minor units + currency, or `decimal(19,4)` cast.

Persist value objects through a **custom cast**:

```php
final class MoneyCast implements CastsAttributes
{
    public function get(Model $model, string $key, mixed $value, array $attributes): ?Money
    {
        return $value === null
            ? null
            : Money::fromMinor((int) $value, $attributes['currency'] ?? 'PHP');
    }

    public function set(Model $model, string $key, mixed $value, array $attributes): array
    {
        if (! $value instanceof Money) {
            throw new InvalidArgumentException('Expected Money.');
        }

        return [$key => $value->minorUnits, 'currency' => $value->currency->value];
    }
}
```

---

## Form Request

One per endpoint. Owns validation **and** authorization entry.

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
            'currency'     => ['required', 'string', Rule::enum(Currency::class)],
            'reason'       => ['nullable', 'string', 'max:500'],
        ];
    }

    public function messages(): array
    {
        return ['amount_minor.min' => __('Refund amount must be at least 1 centavo.')];
    }
}
```

- Array syntax for rules, not pipe strings — composable and readable.
- Business rules that need a query go in a custom `Rule` object (`app/Rules/`), not a
  closure inline.
- `prepareForValidation()` for normalisation (trim, uppercase a code). Not for defaults
  that hide missing input.
- **Never** use the request to build the model directly (`Model::create($request->all())`).

---

## API Resource

The only place a model becomes JSON.

```php
final class OrderResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id'         => $this->id,
            'status'     => $this->status->value,
            'total'      => ['minor' => $this->total->minorUnits, 'currency' => $this->total->currency->value],
            'placed_at'  => $this->placed_at->toIso8601String(),
            'customer'   => CustomerResource::make($this->whenLoaded('customer')),
            'lines'      => OrderLineResource::collection($this->whenLoaded('lines')),
            'can'        => [
                'refund' => $request->user()?->can('refund', $this->resource) ?? false,
            ],
        ];
    }
}
```

`whenLoaded()` is not optional — without it, resources are the most common source of
N+1 in an API. See `laravel-performance`.

Shape, envelope, and error contract are owned by `laravel-api-standards`.

---

## Policy vs Gate

**Policy** — authorization tied to a model class. Auto-discovered in Laravel 12 by
`App\Models\Order` → `App\Policies\OrderPolicy`.

```php
final class OrderPolicy
{
    public function view(User $user, Order $order): bool
    {
        return $user->tenant_id === $order->tenant_id;
    }

    public function refund(User $user, Order $order): Response
    {
        if ($user->tenant_id !== $order->tenant_id) {
            return Response::denyAsNotFound();      // do not leak existence
        }

        return $user->hasPermission('orders.refund')
            ? Response::allow()
            : Response::deny(__('You do not have permission to issue refunds.'));
    }
}
```

`denyAsNotFound()` matters: returning 403 for another tenant's record confirms it exists.

**Gate** — everything not tied to a model instance: `Gate::define('access-admin-panel', ...)`.

Authorization *content* (what rules to write, tenant scoping, IDOR) is owned by
`laravel-security`.

---

## Middleware

Cross-cutting **request** concerns: auth, throttle, locale, tenant resolution, headers.

Not for business rules. `EnsureOrderIsRefundable` as middleware is wrong — it is a
domain check that belongs in the action, where a queue job hits it too.

Laravel 12 registration (`bootstrap/app.php`):

```php
->withMiddleware(function (Middleware $middleware) {
    $middleware->web(append: [SetLocale::class]);
    $middleware->alias(['tenant' => EnsureTenantAccess::class]);
})
```

---

## Events and listeners

Event = a fact, past tense, immutable. Listener = one consequence.

```php
final class OrderRefunded
{
    use Dispatchable, SerializesModels;

    public function __construct(
        public readonly Order $order,
        public readonly Money $amount,
    ) {}
}

final class NotifyCustomerOfRefund implements ShouldQueue
{
    public function handle(OrderRefunded $event): void
    {
        $event->order->customer->notify(new RefundIssued($event->amount));
    }
}
```

Rules:
- One listener, one consequence. Four consequences = four listeners.
- Queue listeners by default (`ShouldQueue`). Exceptions: something that must be visible
  in the same request.
- Do not use events for the *primary* operation — an event whose absence breaks the
  feature is control flow in disguise, and it will be invisible during debugging.
- Do not put business decisions in listeners; decide in the action, react in the listener.

---

## Jobs

```php
final class GenerateMonthlyStatement implements ShouldQueue, ShouldBeUnique
{
    use Queueable;

    public int $tries = 3;
    public int $timeout = 120;
    public array $backoff = [10, 60, 300];

    public function __construct(
        public readonly int $accountId,     // ID, not a hydrated model
        public readonly string $period,
    ) {}

    public function uniqueId(): string
    {
        return "{$this->accountId}:{$this->period}";
    }

    public function handle(BuildStatement $build): void
    {
        $build->handle(Account::findOrFail($this->accountId), $this->period);
    }

    public function failed(Throwable $e): void
    {
        Log::error('Statement generation failed', ['account' => $this->accountId, 'error' => $e->getMessage()]);
    }
}
```

- **Idempotent.** Jobs retry. A job that double-charges on retry is a bug waiting for a
  network blip.
- Small payloads. `SerializesModels` re-queries on unserialize, which is fine, but a job
  carrying a 200-row collection is not.
- Always set `$tries`, `$timeout`, `$backoff`. Defaults are rarely right.
- The job handler is an **entrypoint** — thin, delegates to an action.

---

## Notifications and Mailables

Delivery mechanism only. The decision to notify belongs in a listener.

```php
final class RefundIssued extends Notification implements ShouldQueue
{
    use Queueable;

    public function __construct(private readonly Money $amount) {}

    public function via(object $notifiable): array
    {
        return $notifiable->prefers_sms ? ['mail', 'vonage'] : ['mail', 'database'];
    }

    public function toMail(object $notifiable): MailMessage { /* ... */ }
}
```

Email templates are UI. They are subject to `laravel-ui-accessibility` (semantic
structure, text alternatives, no colour-only meaning) and `laravel-responsive-design`.

---

## Repository — the justified case

Wrapping Eloquent adds nothing. What earns a repository is a **real second implementation**.

```php
interface OrderSearch
{
    /** @return LengthAwarePaginator<Order> */
    public function matching(OrderSearchCriteria $criteria): LengthAwarePaginator;
}

final class DatabaseOrderSearch implements OrderSearch { /* Eloquent */ }
final class ElasticOrderSearch implements OrderSearch { /* Elasticsearch */ }
```

Both implementations exist. Swapping them is a config change. That is a repository doing
work.

Contrast — this is the anti-pattern:

```php
// Adds a file, an interface, a binding, and zero capability.
final class UserRepository
{
    public function find(int $id): ?User { return User::find($id); }
    public function all(): Collection    { return User::all(); }
}
```

**Never return a query builder** from a repository — the caller then depends on Eloquent
anyway, and the abstraction is decorative.

---

## Dependency injection

- Constructor injection everywhere in domain/application classes.
- Bind interfaces in a service provider's `register()`; use `singleton` for stateless
  collaborators, `bind` when per-resolution state matters.
- Contextual binding when two consumers need different implementations:

```php
$this->app->when(ExportReport::class)
    ->needs(Filesystem::class)
    ->give(fn () => Storage::disk('reports'));
```

- Facades and `app()` are acceptable in controllers, commands, and providers. Avoid them
  inside actions/services you want to unit test without booting the framework.
- Never use the container as a service locator inside a loop.

---

## PSR compliance

| PSR | Applies |
|---|---|
| PSR-1 / PSR-12 | Coding style — enforced by Pint (`laravel-code-quality`) |
| PSR-4 | Autoloading — one class per file, namespace mirrors directory |
| PSR-3 | Logging — type-hint `LoggerInterface`, not the `Log` facade, in domain code |
| PSR-7 / PSR-18 | Only when integrating a PSR HTTP client; Laravel's `Http` wraps Guzzle |
| PSR-11 | Container — `ContainerInterface` where framework independence matters |

Do not chase PSR-7 inside Laravel; the framework's `Request` is the idiomatic choice.
