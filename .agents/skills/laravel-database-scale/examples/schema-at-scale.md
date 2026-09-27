# The same feature, designed at two scales

A notification system. Same requirements; different correct answers.

## Requirement

Users receive notifications. They can list unread ones, mark them read, and browse history.

---

## At 1M rows (a few thousand users)

```php
Schema::create('notifications', function (Blueprint $table): void {
    $table->id();
    $table->foreignId('user_id')->constrained()->cascadeOnDelete();
    $table->string('type');
    $table->json('data');
    $table->timestamp('read_at')->nullable();
    $table->timestamps();

    $table->index(['user_id', 'read_at']);
});
```

```php
// Perfectly fine here
$notifications = auth()->user()->notifications()->latest()->paginate(20);
$unreadCount   = auth()->user()->notifications()->whereNull('read_at')->count();
```

This is correct. Do not over-engineer it. `paginate()` runs a `COUNT(*)` that is trivial at
this size, and `LIKE`, `OFFSET`, and ad-hoc aggregation all work.

---

## At 100M rows (millions of users, years of history)

Every line above becomes a problem. Here is what changes and why.

```php
Schema::create('notifications', function (Blueprint $table): void {
    // ── Keys ────────────────────────────────────────────────────────────────
    $table->id();

    // ULID, not UUIDv4: time-ordered, so it does not fragment the index.
    $table->ulid('public_id')->unique();

    $table->foreignId('user_id')->constrained()->cascadeOnDelete();

    // ── Sized types ─────────────────────────────────────────────────────────
    // 100M rows × the difference between VARCHAR(255) and VARCHAR(64) is real.
    $table->string('type', 64);

    // Promoted out of JSON because it is filtered on.
    $table->unsignedTinyInteger('channel');          // 1 byte, enum-backed
    $table->unsignedBigInteger('subject_id')->nullable();
    $table->string('subject_type', 32)->nullable();

    // Everything not filtered on stays in JSON.
    $table->json('data');

    $table->timestamp('read_at')->nullable();
    $table->timestamp('created_at')->useCurrent();
    // No updated_at — notifications are never updated except read_at.

    // ── Indexes ─────────────────────────────────────────────────────────────
    // The dominant query: a user's unread notifications, newest first.
    // Equality (user_id) → equality (read_at IS NULL) → sort (id).
    $table->index(['user_id', 'read_at', 'id'], 'notifications_user_unread_idx');

    // History browsing: keyset pagination needs (user_id, id).
    $table->index(['user_id', 'id'], 'notifications_user_id_idx');

    // Retention job scans by date.
    $table->index('created_at');
});
```

### What changed, and why

**1. No `paginate()` — `COUNT(*)` is a scan**

```php
// ✗ COUNT(*) over a user's 40,000 notifications, on every page load
$notifications = $user->notifications()->latest()->paginate(20);

// ✓ Keyset. O(1) at any depth, no COUNT.
$notifications = $user->notifications()
    ->orderByDesc('id')
    ->cursorPaginate(20);
```

**2. No live unread count**

```php
// ✗ Counts up to 40,000 rows on every page render
$unread = $user->notifications()->whereNull('read_at')->count();

// ✓ Maintained counter on the users table
$table->unsignedInteger('unread_notifications_count')->default(0);
```

```php
// Atomic — no read-modify-write race
User::whereKey($userId)->increment('unread_notifications_count');
User::whereKey($userId)->decrement('unread_notifications_count');

// Capped correction, in case of drift
Schedule::job(new ReconcileUnreadCounts)->dailyAt('04:00');
```

**3. Partial index for the hot query**

98% of rows are read. Only the unread ones are queried on every page load.

```sql
-- PostgreSQL
CREATE INDEX notifications_unread_idx
    ON notifications (user_id, id DESC)
    WHERE read_at IS NULL;
```

This index is ~2% of the size of the full one, so it stays resident in memory. On MySQL,
approximate it with a generated column, or accept the composite index.

**4. Partitioned by month**

```sql
CREATE TABLE notifications (
    id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id     BIGINT UNSIGNED NOT NULL,
    type        VARCHAR(64) NOT NULL,
    data        JSON,
    read_at     TIMESTAMP NULL,
    created_at  DATETIME NOT NULL,
    PRIMARY KEY (id, created_at),        -- partition key must be in every unique key
    KEY notifications_user_created_idx (user_id, created_at)
) ENGINE=InnoDB
PARTITION BY RANGE (TO_DAYS(created_at)) (
    PARTITION p2026_05 VALUES LESS THAN (TO_DAYS('2026-06-01')),
    PARTITION p2026_06 VALUES LESS THAN (TO_DAYS('2026-07-01')),
    PARTITION p2026_07 VALUES LESS THAN (TO_DAYS('2026-08-01')),
    PARTITION pmax     VALUES LESS THAN MAXVALUE
);
```

Retention becomes free:

```sql
ALTER TABLE notifications DROP PARTITION p2026_05;   -- milliseconds, not hours
```

The costs, stated plainly: no foreign keys on a partitioned MySQL table, the PK had to
change, and a query without a `created_at` filter scans every partition. Those are real,
and they are the price of instant retention at this volume.

**5. Bulk insert, not per-row**

```php
// ✗ 50,000 inserts for a broadcast notification
foreach ($users as $user) {
    $user->notify(new SystemAnnouncement($message));
}

// ✓ Batched
User::where('active', true)->chunkById(5000, function (Collection $users) use ($payload): void {
    Notification::insert(
        $users->map(fn (User $u): array => [
            'public_id'  => (string) Str::ulid(),
            'user_id'    => $u->id,
            'type'       => SystemAnnouncement::class,
            'channel'    => Channel::Database->value,
            'data'       => json_encode($payload),
            'created_at' => now(),
        ])->all()
    );

    User::whereIn('id', $users->modelKeys())->increment('unread_notifications_count');
});
```

**6. Retention policy, decided up front**

| Age | Action |
|---|---|
| 0–3 months | Hot partition, fully indexed |
| 3–12 months | Older partitions, still queryable |
| > 12 months | `DROP PARTITION` |

---

## Side by side

| Concern | 1M | 100M |
|---|---|---|
| Primary key | `id()` | `id()` + ULID public id |
| Pagination | `paginate()` | `cursorPaginate()` |
| Unread count | `COUNT(*)` | Maintained counter column |
| Filterable attributes | Inside JSON | Promoted to columns |
| String sizes | Defaults fine | Sized explicitly |
| Indexes | One composite | Composite + partial |
| Retention | Nothing | Partition + drop |
| Inserts | `$user->notify()` | Batched `insert()` |
| Foreign keys | Yes | Not on a partitioned MySQL table |
| Reporting | Ad-hoc `GROUP BY` | Summary table |

---

## The judgement this example is really about

**Do not build the 100M design for a 1M table.** The right-hand column costs: no FKs, a
counter that can drift, partition maintenance that can fail, and a schema that is harder to
change. Those are bad trades at 1M rows, where the simple version is fast and correct.

The point is to know **which decisions are expensive to reverse**, and get those right early:

| Decision | Reversible later? |
|---|---|
| Adding an index | Easy |
| Adding a column | Easy |
| Changing pagination | Easy |
| Adding a counter cache | Moderate |
| Changing a column type on 100M rows | Hard |
| Changing the primary key | Very hard |
| Introducing partitioning retroactively | Very hard |
| Adding `tenant_id` to an existing schema | Very hard |

So at 1M rows, still: choose the primary key deliberately, include `tenant_id` if the
product might ever be multi-tenant, size the columns, and write down the retention policy.
Everything else can wait until the numbers justify it.

The cheapest time to ask "how big does this get?" is before the first migration runs.
