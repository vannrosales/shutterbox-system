# Complexity, duplication, and dead code

Metrics are prompts to look, not verdicts. A method that trips a threshold deserves thirty
seconds of attention, not an automatic rewrite.

## Tools

```bash
composer require --dev phpmd/phpmd
composer require --dev sebastian/phpcpd
composer require --dev nunomaduro/phpinsights
```

```bash
vendor/bin/phpmd app text cleancode,codesize,unusedcode,design
vendor/bin/phpcpd app --min-lines=8 --min-tokens=60
vendor/bin/phpinsights analyse app --min-quality=85 --min-complexity=80
```

PHPInsights gives a single readable dashboard across code, architecture, complexity, and
style. Good for a periodic health check; too opinionated to gate a build on.

## Thresholds

| Metric | Limit | What exceeding it usually means |
|---|---|---|
| Cyclomatic complexity | 10 per method | Too many decisions in one place |
| NPath complexity | 200 | Combinatorial branching; untestable |
| Method length | 30 lines | The method does two things |
| Class length | 300 lines | Several classes wearing one name |
| Parameters | 5 | Pass a DTO |
| Nesting depth | 3 | Needs guard clauses |
| Public methods per class | 10 | Missing a boundary |
| Coupling (dependencies) | 13 | Doing too much |

### Legitimate exceptions

```php
// A match on an enum is high complexity by the metric and perfectly readable
public function label(): string
{
    return match ($this) {
        self::Draft     => __('Draft'),
        self::Issued    => __('Issued'),
        self::Paid      => __('Paid'),
        self::Refunded  => __('Refunded'),
        self::Void      => __('Void'),
    };
}
```

```php
// A validation rules() array is long and should be
public function rules(): array
{
    return [ /* 40 lines of rules */ ];
}
```

```php
// A factory definition() is a flat list
```

Configure the tool to skip them rather than contorting the code:

```xml
<rule ref="rulesets/codesize.xml/CyclomaticComplexity">
    <properties>
        <property name="reportLevel" value="10"/>
    </properties>
</rule>
<exclude-pattern>*/app/Enums/*</exclude-pattern>
<exclude-pattern>*/app/Http/Requests/*</exclude-pattern>
<exclude-pattern>*/database/factories/*</exclude-pattern>
```

## Reducing complexity

### Guard clauses

```php
// ✗ Nesting depth 4
public function handle(Order $order): void
{
    if ($order->isPaid()) {
        if ($order->isRefundable()) {
            if ($this->user->can('refund', $order)) {
                if ($order->total > 0) {
                    $this->refund($order);
                }
            }
        }
    }
}

// ✓ Depth 1, and each failure has its own message
public function handle(Order $order): void
{
    if (! $order->isPaid()) {
        throw new OrderNotPaid($order);
    }

    if (! $order->isRefundable()) {
        throw new OrderNotRefundable($order);
    }

    if (! $this->user->can('refund', $order)) {
        throw new NotAuthorised();
    }

    $this->refund($order);
}
```

Guard clauses also produce better errors: the nested version cannot tell the user *which*
condition failed.

### Extract until the method reads as prose

```php
// ✗ 60 lines
public function handle(Order $order, RefundData $data): Refund
{
    // validate ... 15 lines
    // calculate ... 20 lines
    // charge ... 10 lines
    // notify ... 15 lines
}

// ✓ The public method is the summary; the detail is one level down
public function handle(Order $order, RefundData $data): Refund
{
    $this->assertRefundable($order, $data);

    $amount = $this->calculateRefundAmount($order, $data);

    return DB::transaction(function () use ($order, $amount): Refund {
        $refund = $this->issueRefund($order, $amount);

        OrderRefunded::dispatch($order, $amount);

        return $refund;
    });
}
```

### Replace conditionals with polymorphism

```php
// ✗ Adding a payment method means editing this method
public function fee(Order $order): Money
{
    return match ($order->payment_method) {
        'card'   => $order->total->percentage(2.9)->plus(Money::fromMinor(30, 'PHP')),
        'gcash'  => $order->total->percentage(2.0),
        'bank'   => Money::fromMinor(1500, 'PHP'),
        'cash'   => Money::zero('PHP'),
    };
}

// ✓ Adding a method means adding a class
interface PaymentMethod
{
    public function fee(Money $total): Money;
}

final class CardPayment implements PaymentMethod { /* ... */ }
final class GcashPayment implements PaymentMethod { /* ... */ }
```

Worth it when the set grows and each case has more than one behaviour. **Not** worth it for
a fixed set of four with one line each — the `match` is clearer.

### Too many parameters → a DTO

```php
// ✗
public function handle(int $userId, string $email, string $name, ?string $phone,
                       bool $notify, string $locale, ?int $teamId): User

// ✓
public function handle(CreateUserData $data): User
```

Five parameters is the threshold, and the reason is call sites: `handle(1, 'a@b.c', 'X',
null, true, 'en', null)` is unreadable and easy to get wrong.

## Duplication

```bash
vendor/bin/phpcpd app --min-lines=8 --min-tokens=60
```

Duplication is a **signal**, not a verdict.

| Duplication | Verdict |
|---|---|
| Three copies of a 3-line null check | Fine. Leave it. |
| Two copies of a 30-line business rule | Extract. It will diverge. |
| Similar-looking code, different reasons to change | **Leave it.** Coupling them is worse. |
| The same validation rules in three Form Requests | Extract a rule object or a trait |
| Identical query in four places | Extract a scope or a query object |

The rule that matters: **extract when the two copies must change together**. If they merely
look alike today, forcing them to share an abstraction creates a class that serves two
masters and satisfies neither.

Premature abstraction costs more than duplication. A wrong abstraction is harder to remove
than a duplicate is to fix.

## Dead code

```bash
vendor/bin/phpmd app text unusedcode
vendor/bin/rector process --dry-run     # with deadCode: true
vendor/bin/phpstan analyse              # level 4+ finds unreachable code
```

Static analysis **cannot** see:

```php
// Called from a route by string
Route::get('/webhook', [WebhookController::class, 'handle']);

// Called via a variable
$this->{'process'.$type}();

// Called from a Blade template
{{ $order->formattedTotal() }}

// Called from a config array
'via' => [MailChannel::class, 'send'],
```

Before deleting anything that looks unused:

```bash
grep -rn "methodName" app/ resources/ routes/ config/ tests/
```

Check the whole repository, including Blade, config, and tests — not just `app/`.

### Finding genuinely unused routes

```bash
php artisan route:list --json | jq -r '.[].name' | sort > /tmp/routes.txt
grep -rhoE "route\('[^']+'\)" resources/ app/ | sed "s/route('//;s/')//" | sort -u > /tmp/used.txt
comm -23 /tmp/routes.txt /tmp/used.txt
```

An unused route is attack surface. Removing it is a security improvement, not only a
tidiness one (`laravel-security`).

## Maintainability review

Metrics do not capture the things that actually make code hard to change. Ask these in
review:

**Naming**
- Does the name say what it does, or how it does it?
- Would a new developer guess correctly what this class contains?
- Are there two names for the same concept in the codebase?

**Cohesion**
- Does this class have one reason to change?
- Do its methods use its properties, or are they a namespace of unrelated functions?

**Coupling**
- How many things break if this changes?
- Does it depend on concretions where an interface would do?
- Does it reach through objects (`$a->b->c->d`)?

**Testability**
- Can this be tested without booting the framework?
- How much setup does one test need? Large setup means the unit is too large.
- Are there hidden dependencies (`now()`, `auth()`, static state)?

**Readability**
- Can you follow it top to bottom without scrolling back?
- Does it need a comment to be understood? (If yes, can a better name remove the need?)
- Are the failure paths as clear as the success path?

The setup-size question is the most reliable signal in the list. A test that needs 40 lines
of arrangement is telling you the thing under test does too much.

## Where to actually spend the effort

Not everything deserves the same standard.

| Code | Standard |
|---|---|
| Domain logic (actions, services, policies) | Highest — this is where bugs cost |
| Public API surface | High — changing it is expensive |
| Infrastructure adapters | Medium — will be replaced anyway |
| Admin/internal tools | Lower — fewer users, lower cost of failure |
| One-off scripts | Make it work, delete it after |
| Legacy being replaced | Do not invest; do not make it worse |

Chasing a uniform metric across all of these wastes effort on code that does not need it,
and rations attention away from the code that does.

## Automating in CI

```yaml
- name: Complexity
  run: vendor/bin/phpmd app github cleancode,codesize,unusedcode || true

- name: Duplication
  run: vendor/bin/phpcpd app --min-lines=8 || true
```

`|| true` deliberately: these are **advisory**. Gate the build on Pint, PHPStan, and tests —
things with an objective right answer. A complexity metric that blocks a merge on a
legitimate `match` statement teaches people to bypass gates.

Track the trend instead. A steadily rising average complexity is worth a conversation; a
single method at 11 is not.
