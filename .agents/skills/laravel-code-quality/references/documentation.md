# Documentation standards

Documentation goes stale faster than code, so the rule is: write only what stays true, and
put it where it will be seen.

## Comments

**Explain why, never what.**

```php
// ✗ Restates the code. Now there are two things to keep in sync.
// Loop through the items and increment the stock
foreach ($order->items as $item) {
    Product::whereKey($item->product_id)->increment('stock', $item->quantity);
}

// ✓ Explains a decision the reader cannot infer from the code
// increment() compiles to SET stock = stock + ?, so concurrent refunds cannot
// lose an update — unlike a read-modify-write.
foreach ($order->items as $item) {
    Product::whereKey($item->product_id)->increment('stock', $item->quantity);
}
```

Comments worth writing:

```php
// The gateway returns 200 with an error body for declined cards, so status
// alone is not enough to determine success.
if ($response->json('status') !== 'succeeded') { }

// Ordered by id, not created_at: created_at is not unique, and cursor
// pagination silently skips rows on a non-unique sort.
->orderByDesc('id')

// 90 days is the card scheme's chargeback window, not an arbitrary choice.
$order->paid_at->diffInDays(now()) <= 90

// TODO(2026-09-01, maria): remove once every client is on v2 — see PLAT-412
```

A `TODO` with no owner and no date is a comment that will be there in five years. Include
both, or delete it.

## Docblocks

Add only what the signature cannot express.

```php
// ✗ Pure noise. Goes stale the moment a parameter changes.
/**
 * Refund an order.
 *
 * @param  Order  $order
 * @param  RefundData  $data
 * @return Refund
 */
public function handle(Order $order, RefundData $data): Refund

// ✓ Adds a generic, and names what it throws
/**
 * @throws OrderNotRefundable  when the order is unpaid or outside the 90-day window
 */
public function handle(Order $order, RefundData $data): Refund
```

Worth documenting:

```php
/** @return Collection<int, Order> */
public function overdue(): Collection;

/** @param list<int> $ids */
public function findMany(array $ids): Collection;

/** @return array{total: int, currency: string} */
public function summary(): array;

/** @return HasMany<OrderLine, $this> */
public function lines(): HasMany;

/** @throws PaymentDeclined */
public function charge(Money $amount): ChargeResult;
```

Generics are the main reason docblocks still exist in modern PHP — they are what let
PHPStan check collection contents (`references/phpstan.md`).

Pint's `no_superfluous_phpdoc_tags` rule strips the noise automatically.

### Class-level docblocks

One earns its place when it states the class's single responsibility, or a constraint.

```php
/**
 * Issues refunds against the payment gateway and restores stock.
 *
 * Idempotent: a second call for an already-refunded order throws rather than
 * charging twice.
 */
final class RefundOrder
```

Not:

```php
/**
 * Class RefundOrder
 *
 * @package App\Actions
 */
```

That template adds nothing and is a strong signal that nobody read the file.

## README

The README answers: what is this, how do I run it, how do I contribute.

```markdown
# Project Name

One sentence on what it does and who uses it.

## Requirements

- PHP 8.4
- MySQL 8.4
- Redis 7
- Node 22

## Local setup

    git clone ...
    composer install
    npm install
    cp .env.example .env
    php artisan key:generate
    php artisan migrate --seed
    npm run dev

Visit http://localhost:8000. Log in with `admin@example.com` / `password`.

## Commands

| Command | Does |
|---|---|
| `composer qa` | Lint, static analysis, tests |
| `composer fix` | Fix code style |
| `php artisan test --parallel` | Run the suite |

## Architecture

Brief orientation, then link to `docs/`. Do not duplicate the code.

## Deployment

See `docs/deployment.md`.
```

Keep it short. A README nobody finishes is a README nobody reads. Depth belongs in `docs/`.

**Test the setup instructions** by following them on a clean machine periodically. Setup
docs rot silently — everyone who could notice already has the project running.

## CLAUDE.md

The instructions file for AI assistance. It should encode what a new contributor would need
to be told twice.

```markdown
# Project conventions

## Stack
Laravel 12, PHP 8.4, MySQL 8.4, Livewire 3, Tailwind 4.

## Engineering standards
This project follows the Laravel Enterprise Skill Library.
Load `laravel-ai-coding-standards` before any change; it routes to the others.

## Project-specific rules
- Business logic goes in `app/Actions`, one public `handle()` per class.
- We do NOT use repositories. Eloquent directly in actions.
- Money is always integer minor units (`*_minor` columns).
- Multi-tenant: every table has `tenant_id`; every composite index leads with it.
- Tests: Pest, not PHPUnit classes.

## Gates before merge
- `composer qa` passes
- `laravel-security` checklist for anything touching money, PII, auth, or uploads
```

Project-specific rules **override** the library's defaults. Say so explicitly, and keep the
list short enough to be read.

## CHANGELOG

```markdown
# Changelog

All notable changes to this project.
Format: [Keep a Changelog](https://keepachangelog.com/). Versioning: [SemVer](https://semver.org/).

## [Unreleased]

### Added
- Bulk invoice export (PLAT-431)

### Fixed
- Refunds outside the 90-day window returned 500 instead of 409 (PLAT-428)

## [2.1.0] - 2026-07-15

### Added
- Cursor pagination on `/api/v1/invoices`

### Changed
- **BREAKING** `total` is now `total.minor` + `total.currency`. See docs/api/v2-migration.md
```

Write it for the **consumer**, not from git log. "Fixed a bug in OrderService" tells a user
nothing; "refunds outside the 90-day window returned 500 instead of 409" tells them whether
it affected them.

Mark breaking changes unmissably.

## Architecture Decision Records

For decisions that are expensive to reverse and whose reasoning will be forgotten.

```markdown
# ADR 007: Cursor pagination for the invoices API

**Status:** Accepted
**Date:** 2026-07-31
**Deciders:** platform team

## Context

The invoices table passed 40M rows. `paginate()` runs `COUNT(*)`, which took 4.2s at p95,
and `OFFSET` on deep pages was worse.

## Decision

Use `cursorPaginate()` on all list endpoints for tables expected to exceed 1M rows.

## Consequences

**Good:** constant-time at any depth; no `COUNT`.

**Bad:** no total count, no jumping to page N. Clients must follow `links.next`. This is a
breaking change, shipped in API v2.

**Rejected alternatives:** caching the count (still wrong within the TTL);
`simplePaginate` (still uses OFFSET).
```

Write one when: the decision was contested, it is expensive to reverse, or someone will ask
"why on earth did they do that" in two years.

Do **not** write one for every choice. Ten good ADRs are read; a hundred are not.

## API documentation

Generated from code — hand-written API docs diverge within a sprint. See
`laravel-api-standards/references/openapi.md`.

The parts a generator cannot produce (getting started, error-code table, rate limits,
webhook signature verification, versioning policy) are written by hand and kept next to the
generated spec.

## What to document, and where

| Thing | Where |
|---|---|
| Why this line is unusual | Inline comment |
| What a class is responsible for | Class docblock |
| Generic types, thrown exceptions | Docblock |
| How to run the project | README |
| Project conventions and AI rules | CLAUDE.md |
| What changed for users | CHANGELOG |
| Why an expensive decision was made | ADR |
| API contract | Generated OpenAPI + hand-written guides |
| How to deploy | `docs/deployment.md` |
| What to do at 3am | Runbook, **in the repository** |

## Keeping it honest

```yaml
- name: Check for stale TODOs
  run: |
    # TODOs with a date in the past
    grep -rnE 'TODO\([0-9]{4}-[0-9]{2}-[0-9]{2}' app/ \
      | awk -F'[()]' -v today="$(date +%F)" '$2 < today' \
      && echo "::warning::Overdue TODOs found" || true
```

```bash
# Do the setup instructions still work? Run them on a clean checkout.
docker run --rm -v "$PWD:/app" -w /app php:8.4-cli bash -c "composer install && php artisan test"
```

Better still: delete documentation you cannot keep true. A wrong instruction costs more
than a missing one, because someone will follow it.

## The one rule

**If the code needs a comment to be understood, first try to make the code not need one.**

```php
// ✗ Comment compensating for a bad name
// Check if the order can be refunded
if ($o->st === 2 && $o->d->diffInDays(now()) <= 90) { }

// ✓ No comment needed
if ($order->isRefundable()) { }
```

The comment is the second-best fix. Naming is the first.
