# New table / schema design gate

Complete before writing the migration.

## Sizing (answer these first)

- [ ] Expected rows at 1 year: __________
- [ ] Expected rows at 5 years: __________
- [ ] Peak write rate: __________ rows/sec
- [ ] Largest expected row size
- [ ] Retention class: reference / core / transactional / operational / telemetry / derived
- [ ] Retention policy written down — **what deletes these rows?**
- [ ] The three most frequent queries written out in full

These answers go in a comment at the top of the migration.

## Keys

- [ ] Primary key chosen deliberately (`id()` unless there is a reason)
- [ ] If a public identifier is exposed, it is a **ULID or UUIDv7**, not UUIDv4
- [ ] No natural key as the primary key unless it is genuinely immutable
- [ ] Composite PK only for pure pivot tables

## Tenancy

- [ ] `tenant_id` present if the product is or might become multi-tenant
- [ ] `tenant_id` **leads every composite index**
- [ ] Every unique constraint is scoped: `unique(['tenant_id', 'slug'])`, not `unique('slug')`
- [ ] A global scope or equivalent makes forgetting the filter impossible

Retrofitting tenancy is one of the hardest migrations there is. Decide now.

## Columns

- [ ] Every type sized to the actual data — no reflexive `string()` at 255
- [ ] Integers sized correctly (`tinyInteger` / `smallInteger` / `integer` / `bigInteger`)
- [ ] Unsigned where negatives are impossible
- [ ] Money as **integer minor units** or `decimal` — never `float`/`double`
- [ ] Fixed sets are `string(32)` + a PHP enum cast, not a database `ENUM`
- [ ] Enums are string-backed, not integer-backed
- [ ] `timestamp` vs `datetime` chosen with the 2038 limit in mind
- [ ] Time zone is UTC in storage
- [ ] Large TEXT/JSON/BLOB columns identified — excluded from list-page `SELECT`s
- [ ] Nothing stored in JSON that will be filtered, sorted, or joined on at scale
- [ ] `NOT NULL` wherever null has no meaning (nullable columns hide bugs)

## Relationships

- [ ] Every FK declared with `constrained()`
- [ ] Delete behaviour chosen per FK: `cascade` / `restrict` / `nullOnDelete`
- [ ] Every FK has an index (explicit — Postgres does not create one)
- [ ] Pivot tables have a composite primary key and a reverse index
- [ ] Polymorphic relations justified — you are accepting the loss of referential integrity
- [ ] `Relation::enforceMorphMap()` registered for any new morphable model

## Indexes

- [ ] Every index maps to a named query you wrote down above
- [ ] Composite order is equality → range → sort
- [ ] Most selective equality column first (except `tenant_id`, which always leads)
- [ ] No redundant single-column index that a composite already covers
- [ ] Covering index considered for the dominant list query
- [ ] Partial index considered where a small subset is queried (e.g. `WHERE read_at IS NULL`)
- [ ] Full-text index if text search is required
- [ ] Total index count on a write-heavy table kept low (≤ ~5)
- [ ] Indexes named explicitly (auto-names hit the 64-char limit)

## Soft deletes

- [ ] Only used where there is a real recovery or audit requirement
- [ ] `deleted_at` indexed
- [ ] Unique constraints account for soft-deleted rows (partial index on Postgres)
- [ ] There is still a hard-delete path for genuine data-erasure requests

## Denormalisation

- [ ] Every denormalised value has a documented owner (which listener/job maintains it?)
- [ ] Counter caches use atomic `increment`/`decrement`, never read-modify-write
- [ ] A reconciliation job exists for anything that can drift
- [ ] Historical value copies (price at time of order) are marked as **correctness**, not
      an optimisation

## Scale readiness

For a table expected to exceed 10M rows:

- [ ] Keyset pagination viable — a deterministic, indexed sort exists with a PK tiebreaker
- [ ] Reporting will use a summary table, not live aggregation
- [ ] Partitioning considered; if adopted, the partition key is in every unique key
- [ ] Search strategy chosen (DB full-text vs dedicated engine)
- [ ] Archive or prune job designed
- [ ] The migration is safe to run online (see `checklists/migration-review.md`)

## Privacy

- [ ] Personal data columns identified
- [ ] Retention period set per RA 10173 / applicable law
- [ ] An anonymisation path exists that preserves referential integrity
- [ ] Deletion propagates to the search index and cache, not just the table
- [ ] Nothing sensitive stored unencrypted that should not be

## Documentation

- [ ] Sizing and retention comment at the top of the migration
- [ ] Index rationale noted next to non-obvious indexes
- [ ] Model has correct `$fillable`, `casts()`, and relationship methods
- [ ] Factory created
- [ ] ERD or schema doc updated if the project keeps one
