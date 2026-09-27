# Schema design

## Naming

| Thing | Convention | Example |
|---|---|---|
| Table | `snake_case`, plural | `order_items` |
| Pivot | singular, alphabetical | `role_user` |
| Column | `snake_case` | `published_at` |
| FK | `{singular}_id` | `customer_id` |
| Boolean | `is_` / `has_` prefix | `is_active`, `has_verified_email` |
| Timestamp | `_at` suffix | `deleted_at`, `last_seen_at` |
| Date | `_on` or `_date` | `due_on` |
| Count cache | `_count` suffix | `comments_count` |
| Index | `{table}_{cols}_idx` | `orders_tenant_status_idx` |

Consistency beats correctness here. If the project already uses something else, match it.

## Column types

```php
Schema::create('orders', function (Blueprint $table): void {
    $table->id();                                       // BIGINT UNSIGNED AUTO_INCREMENT
    $table->ulid('public_id')->unique();                // opaque external identifier

    $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
    $table->foreignId('customer_id')->constrained()->restrictOnDelete();

    $table->string('reference', 32)->unique();
    $table->string('status', 32)->default('pending');   // not VARCHAR(255)
    $table->char('currency', 3)->default('PHP');

    $table->unsignedBigInteger('total_minor');          // money as integer minor units
    $table->decimal('tax_rate', 5, 4)->default(0);      // exact decimal

    $table->unsignedSmallInteger('item_count')->default(0);
    $table->unsignedInteger('view_count')->default(0);

    $table->json('metadata')->nullable();
    $table->text('notes')->nullable();                  // stored off-page

    $table->timestamp('placed_at')->nullable();
    $table->timestamps();
    $table->softDeletes();

    $table->index(['tenant_id', 'status', 'placed_at']);
    $table->index(['tenant_id', 'customer_id']);
    $table->index('deleted_at');
});
```

### Sizing guide

| Need | Type | Bytes | Range |
|---|---|---|---|
| Flag | `boolean` | 1 | — |
| Small enum-ish | `unsignedTinyInteger` | 1 | 0–255 |
| Quantity | `unsignedSmallInteger` | 2 | 0–65,535 |
| Counter | `unsignedInteger` | 4 | 0–4.29B |
| ID / money minor | `unsignedBigInteger` | 8 | huge |
| Status string | `string(32)` | 1+n | — |
| Country/currency | `char(2)` / `char(3)` | fixed | — |
| Exact decimal | `decimal(19,4)` | ~9 | — |
| Point in time | `timestamp` | 4 | 1970–2038 (!) |
| Wide date range | `datetime` | 8 | 1000–9999 |
| Free text | `text` | off-page | 64KB |

The `timestamp` 2038 limit is real. For dates that can exceed 2038 (contract end dates,
birth dates, scheduled far-future events), use `datetime`. For `created_at`/`updated_at`,
`timestamp` is fine and cheaper.

**Never `float`/`double` for money.** `0.1 + 0.2 !== 0.3`. Use integer minor units
(preferred — no rounding decisions at all) or `decimal(19,4)`.

### Strings

`VARCHAR(255)` is Laravel's default and is almost never the right size. It matters because
MySQL index prefixes and temporary tables allocate by the declared maximum.

```php
$table->string('email', 255);        // legitimate — email max is 254
$table->string('status', 32);
$table->string('slug', 160);
$table->char('country_code', 2);
```

## Enums

Store as a **string**, cast to a PHP enum. Do not use a database `ENUM` type — changing it
requires an `ALTER TABLE` on the whole table.

```php
$table->string('status', 32)->default(OrderStatus::Pending->value);
$table->index(['tenant_id', 'status']);
```

```php
protected function casts(): array
{
    return ['status' => OrderStatus::class];
}
```

String-backed, not integer-backed: an integer-backed enum makes the raw table unreadable
and makes reordering cases catastrophic.

## Relationships

```php
// One-to-many
$table->foreignId('customer_id')->constrained()->restrictOnDelete();

// One-to-one — the FK plus a unique constraint
$table->foreignId('user_id')->unique()->constrained()->cascadeOnDelete();

// Many-to-many pivot
Schema::create('role_user', function (Blueprint $table): void {
    $table->foreignId('user_id')->constrained()->cascadeOnDelete();
    $table->foreignId('role_id')->constrained()->cascadeOnDelete();
    $table->timestamps();

    $table->primary(['user_id', 'role_id']);   // composite PK, no surrogate id
    $table->index('role_id');                   // reverse lookup
});

// Polymorphic
$table->morphs('commentable');                  // commentable_id + commentable_type + index
$table->ulidMorphs('subject');                  // ULID variant
$table->nullableMorphs('causer');
```

### Polymorphic — the honest trade-off

Polymorphic relations cannot have foreign keys. You lose referential integrity: nothing
stops a `commentable_id` pointing at a deleted row, and the database will not cascade.

Use them for genuinely open-ended relations (comments, tags, activity logs, attachments).
Do not use them for a fixed set of two or three types — separate nullable FKs, or separate
tables, keep integrity.

Always register a morph map so the class name is not stored in the database:

```php
// AppServiceProvider::boot()
Relation::enforceMorphMap([
    'post'    => Post::class,
    'comment' => Comment::class,
    'invoice' => Invoice::class,
]);
```

Without this, renaming or moving a class breaks every stored row. `enforceMorphMap` (rather
than `morphMap`) throws on unregistered types, which is what you want.

## Multi-tenancy

Three approaches:

| Approach | Isolation | Complexity | Use when |
|---|---|---|---|
| **Shared schema, `tenant_id` column** | Logical | Low | Default. Most SaaS. |
| Schema per tenant | Strong | Medium | Regulatory separation, tens–hundreds of tenants |
| Database per tenant | Strongest | High | Enterprise contracts, data residency |

For the shared-schema approach:

```php
$table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
$table->index(['tenant_id', 'created_at']);       // tenant_id leads EVERY composite index
$table->unique(['tenant_id', 'slug']);            // uniqueness is per tenant
```

```php
// A global scope so forgetting the filter is impossible
final class TenantScope implements Scope
{
    public function apply(Builder $builder, Model $model): void
    {
        if ($tenantId = Context::get('tenant_id')) {
            $builder->where($model->qualifyColumn('tenant_id'), $tenantId);
        }
    }
}
```

A missing tenant filter is a **data breach**, not a bug. The global scope plus
`tenant_id`-leading indexes plus a test that asserts cross-tenant access returns 404 are all
required. See `laravel-security`.

## JSON columns

```php
$table->json('settings')->nullable();
```

```php
Order::where('metadata->source', 'api')->get();
Order::whereJsonContains('tags', 'urgent')->get();
```

Use JSON for genuinely schemaless data: user preferences, third-party payloads, sparse
attributes.

Do **not** use it for anything you filter, sort, or join on at scale. JSON extraction
cannot use an ordinary index. If a JSON path becomes hot, promote it:

```php
// Generated column + index (MySQL 8)
DB::statement("
    ALTER TABLE orders
    ADD COLUMN source VARCHAR(32)
        GENERATED ALWAYS AS (metadata->>'$.source') STORED,
    ADD INDEX orders_source_idx (source)
");
```

```sql
-- Postgres: GIN index over the whole document
CREATE INDEX orders_metadata_gin ON orders USING gin (metadata jsonb_path_ops);
```

Rule: if you would put it in a WHERE clause on a table over ~1M rows, it deserves a column.

## Normalisation and when to break it

Normalise by default. Denormalise deliberately, for a named query, with a plan to keep it
consistent.

Legitimate denormalisation:

```php
// Counter cache — avoids COUNT(*) on every page load
$table->unsignedInteger('comments_count')->default(0);

// Copy of a value that must not change retroactively
$table->string('customer_name_at_purchase');
$table->unsignedBigInteger('unit_price_minor');   // price at time of order

// Flag that avoids an EXISTS subquery in a hot list
$table->boolean('has_unpaid_invoices')->default(false)->index();
```

The order-line price copy is not denormalisation for speed — it is **correctness**. An
invoice must show the price charged, not today's price.

Every denormalised value needs a documented owner: which listener or job keeps it correct?

```php
final class UpdateCommentsCount
{
    public function handle(CommentCreated|CommentDeleted $event): void
    {
        Post::whereKey($event->comment->post_id)
            ->update(['comments_count' => DB::raw('(SELECT COUNT(*) FROM comments WHERE post_id = posts.id)')]);
    }
}
```

## Timestamps and time zones

```php
// config/app.php
'timezone' => 'UTC',
```

**Store UTC. Always.** Convert for display only. A database storing local time is
unrecoverable once daylight saving or a server move happens.

```php
protected function casts(): array
{
    return ['placed_at' => 'immutable_datetime'];
}
```

`immutable_datetime` gives `CarbonImmutable`, which prevents the classic bug where
`$date->addDay()` mutates a shared instance.

For Philippine applications: store UTC, display `Asia/Manila`. Business-day calculations
must account for Philippine holidays — keep a holidays table rather than hardcoding.

## Table-level checklist

For every new table:

- [ ] Primary key chosen deliberately
- [ ] `tenant_id` present if multi-tenant, and leading every composite index
- [ ] Every FK constrained, with delete behaviour chosen
- [ ] Every FK indexed (explicitly, for Postgres)
- [ ] Column types sized to the actual data
- [ ] Money as integer minor units or `decimal`
- [ ] Uniqueness constraints reflect real business rules (scoped by tenant)
- [ ] Indexes match the queries that will run
- [ ] Timestamps present
- [ ] Soft deletes only if justified — and indexed
- [ ] Retention answer documented
- [ ] Estimated row count at 1 and 5 years recorded in the migration comment
