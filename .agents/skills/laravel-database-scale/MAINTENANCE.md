# Maintaining `laravel-database-scale`

## Review triggers

| Trigger | Action |
|---|---|
| MySQL or PostgreSQL major release | Re-check the danger table in `references/migrations.md` — online-DDL capabilities change with almost every release |
| A migration causes an outage | Add the operation to the danger table and the checklist |
| A table outgrows its design | Record what the early warning sign was in `references/growth.md` |
| New Laravel schema-builder features | Update the stubs |
| Project adopts a new engine (Postgres, PlanetScale, Vitess, Aurora) | Add engine-specific notes; do not assume MySQL semantics |

Scheduled: every 6 months, plus after any database version upgrade.

## The part most likely to be wrong

`references/migrations.md` — the operation danger table. It is version-specific and it
changes:

- MySQL 8.0.12 made adding a column with a default instant
- MySQL 8.0.29 made dropping a column instant
- PostgreSQL 11 made adding a column with a default instant
- Each release moves more operations from "rebuild" to "metadata only"

**Verify against the actual server version before trusting it.** The safest habit is to
measure on a production-sized copy rather than rely on the table.

```sql
SELECT VERSION();
```

Record the versions the table was verified against when you update it.

## What to update where

| Change | File |
|---|---|
| Index technique | `references/indexing.md` |
| Column types, keys, relationships, tenancy | `references/schema-design.md` |
| Partitioning, replicas, sharding, search | `references/scaling.md` |
| Migration safety | `references/migrations.md` |
| Retention, archival, summary tables | `references/growth.md` |
| Audit queries | `templates/index-audit.sql` |
| New blocking rule | `checklists/migration-review.md` or `checklists/schema-design.md` |

The scale bands table in `SKILL.md` and the ladder in `references/scaling.md` must agree.
Change both together.

## Testing changes to this skill

1. Skill loads: `/laravel-database-scale`
2. Prompt test — *"Create a table for user activity events"* — verify the output asks about
   volume and retention, sizes columns, and proposes a retention strategy without being
   asked
3. Second prompt test — *"Add a status column to the orders table"* — verify it warns about
   `->after()` and proposes the nullable-then-backfill pattern
4. SQL templates parse against a real database:

```bash
mysql -u root app < .claude/skills/laravel-database-scale/templates/index-audit.sql
```

(Run only the MySQL section; the file contains both dialects, separated by comments.)

5. Stubs are valid PHP **after placeholder substitution** — the `{{ Table }}` /
   `{{ Model }}` tokens make the raw files intentionally unparseable:

```bash
for f in templates/*.stub; do
    sed -E 's/\{\{ *[A-Za-z_]+ *\}\}/Placeholder/g' "$f" > /tmp/stub.php && php -l /tmp/stub.php
done
```

## Boundary discipline

Owns: schema, indexes, keys, constraints, partitioning, retention, migration safety,
search-strategy **selection**.

Hand off:
- Eager loading, query shape, N+1 → `laravel-performance`
- Caching → `laravel-performance`
- Backups, replication setup, server tuning, connection pooling → `laravel-devops-deployment`
- SQL injection, tenant-scoping as a security control → `laravel-security`
- Where model classes live → `laravel-enterprise-architecture`

**The boundary to police most carefully is indexes.** `laravel-performance` says "check the
plan, add the index the query needs" and stops there. Everything about *choosing* an index —
composite order, cardinality, covering, partial, write cost — lives here. If that material
starts appearing in both skills, they will drift and give contradictory advice.

Second shared area: **multi-tenancy**. This skill owns the schema shape (`tenant_id`
column, leading index position, scoped unique constraints). `laravel-security` owns the
enforcement (global scopes, policy checks, cross-tenant tests, `denyAsNotFound`). Both
mention it; neither should try to own both halves.

## A note on the scale bands

The bands in `SKILL.md` (1M / 10M / 100M / 1B) are deliberately coarse. Resist the urge to
add precision — the real thresholds depend on row width, hardware, buffer pool size, and
query shape far more than on row count alone. The bands exist to prompt the right question
("is this table going to be big?"), not to be a lookup table.

If a project keeps hitting problems at a band boundary, that is a signal to add a worked
example, not to renumber the bands.

## Changelog

| Date | Change |
|---|---|
| 2026-07-31 | Initial version. Targets MySQL 8.x / PostgreSQL 15+. |
