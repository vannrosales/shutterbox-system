# Backups and disaster recovery

**An untested backup is a hope, not a backup.** Everything in this file follows from that.

## Define the targets first

| Term | Meaning | Question it answers |
|---|---|---|
| **RPO** — Recovery Point Objective | Acceptable data loss | "How much work can we afford to lose?" |
| **RTO** — Recovery Time Objective | Acceptable downtime | "How long can we be down?" |

| Application type | Typical RPO | Typical RTO |
|---|---|---|
| Internal tool | 24 h | 8 h |
| SaaS | 1 h | 1 h |
| E-commerce | 15 min | 30 min |
| Financial / healthcare | ~0 | minutes |

These numbers drive everything else. RPO of 1 hour means hourly backups **or** binary-log
replication. RPO near zero means a replica with automatic failover — daily dumps cannot
deliver it, and pretending otherwise is the failure people discover during the incident.

Agree the targets with the business, write them down, and check the actual capability
against them.

## What to back up

| Asset | Method | Frequency |
|---|---|---|
| Database | `mysqldump` / `pg_dump`, or a managed snapshot | Daily minimum; hourly for low RPO |
| User uploads | Object-storage versioning, or sync | Continuous or daily |
| `.env` | Secrets manager (not in the backup) | On change |
| Code | Git | Every push |
| Server config | Infrastructure-as-code or a config repo | On change |
| TLS certificates | Re-issuable; document the process | n/a |

Code and configuration are recoverable from Git. **Data and uploads are not.** Focus
effort there.

## spatie/laravel-backup

```bash
composer require spatie/laravel-backup
```

```php
// config/backup.php
'backup' => [
    'name' => env('APP_NAME'),
    'source' => [
        'files' => [
            'include' => [storage_path('app/private')],
            'exclude' => [
                storage_path('app/private/exports'),   // regenerable
                storage_path('logs'),
                base_path('vendor'),
                base_path('node_modules'),
            ],
        ],
        'databases' => ['mysql'],
    ],
    'destination' => [
        'disks' => ['s3'],           // OFF-SITE. Same-server backups die with the server.
    ],
    'password' => env('BACKUP_ARCHIVE_PASSWORD'),
    'encryption' => 'default',
],

'cleanup' => [
    'default_strategy' => [
        'keep_all_backups_for_days'                 => 7,
        'keep_daily_backups_for_days'               => 16,
        'keep_weekly_backups_for_weeks'             => 8,
        'keep_monthly_backups_for_months'           => 6,
        'keep_yearly_backups_for_years'             => 2,
        'delete_oldest_backups_when_using_more_megabytes_than' => 50_000,
    ],
],

'monitor_backups' => [
    [
        'name' => env('APP_NAME'),
        'disks' => ['s3'],
        'health_checks' => [
            MaximumAgeInDays::class          => 1,
            MaximumStorageInMegabytes::class => 50_000,
        ],
    ],
],
```

```php
Schedule::command('backup:run')->dailyAt('01:00');
Schedule::command('backup:clean')->dailyAt('02:00');
Schedule::command('backup:monitor')->dailyAt('08:00');   // alerts if a backup is missing
```

`backup:monitor` is the important one. It answers "did the backup actually run?" — the
question nobody asks until they need the backup.

Pair it with dead-man's-switch monitoring so a *silently stopped scheduler* is caught too:

```php
Schedule::command('backup:run')->dailyAt('01:00')->thenPing('https://hc-ping.com/uuid');
```

## Encryption and access

- `BACKUP_ARCHIVE_PASSWORD` set, and stored **outside** the backup destination
- Bucket versioning on, with MFA delete
- Separate credentials: the application writes; only the restore process reads
- Object-lock / immutability where ransomware is a concern — a compromised application
  credential must not be able to delete the backups

That last point matters more than people expect. If the app's S3 key can delete objects,
an attacker who compromises the app deletes the backups first.

## Database specifics

```bash
# MySQL — consistent dump without locking the whole database
mysqldump \
  --single-transaction \
  --routines --triggers --events \
  --set-gtid-purged=OFF \
  --default-character-set=utf8mb4 \
  app_production | gzip > backup.sql.gz
```

`--single-transaction` gives a consistent snapshot of InnoDB tables without a global lock.
Without it, a dump of a busy database either blocks writes or produces an inconsistent file.

```bash
# PostgreSQL — custom format allows parallel restore and selective recovery
pg_dump -Fc -Z9 app_production > backup.dump
pg_restore -j 4 -d app_production backup.dump
```

### Point-in-time recovery

Daily dumps mean up to 24 hours of loss. For a tighter RPO:

```ini
# MySQL binary logging
log_bin = /var/log/mysql/mysql-bin.log
binlog_expire_logs_seconds = 604800     # 7 days
```

```bash
# Restore the dump, then replay the binlog up to a chosen moment
mysqlbinlog --stop-datetime="2026-07-31 14:29:00" mysql-bin.000123 | mysql app_production
```

This is what turns "we lost a day" into "we lost 30 seconds" after an accidental
`DELETE` — and it is the only way to hit a sub-hour RPO with self-managed MySQL.

Managed databases (RDS, Cloud SQL, PlanetScale) provide PITR without this work. Usually
worth the price.

## Uploads

```bash
# Sync to a second bucket, ideally a different provider or region
aws s3 sync s3://app-media s3://app-media-backup --delete
```

Object-storage **versioning** protects against accidental deletion and overwrite, and is
often enough on its own. Cross-region replication protects against a regional failure.

Note: `--delete` propagates deletions, which defeats protection against accidental
deletion. Either omit it and accept growth, or rely on versioning instead.

## The restore drill — the part that matters

Quarterly, minimum. Untested backups fail at roughly the rate you would fear.

```bash
# 1. Provision a clean environment (a container or a scratch VM)
# 2. Fetch the LATEST backup — not a known-good older one
aws s3 cp s3://backups/app/2026-07-31-01-00-00.zip .

# 3. Restore
unzip -P "$BACKUP_ARCHIVE_PASSWORD" 2026-07-31-01-00-00.zip
gunzip < db-dumps/mysql-app_production.sql.gz | mysql app_restored

# 4. Verify
mysql app_restored -e "SELECT COUNT(*) FROM users; SELECT MAX(created_at) FROM orders;"

# 5. Boot the application against it and click through a real journey
# 6. TIME THE WHOLE THING
```

Record: the time taken, anything that went wrong, and whether the result met the RTO. If it
took six hours and the RTO is one hour, you do not have a one-hour RTO — you have a
document that says so.

Compare row counts and the newest timestamp against production. A backup that restores
cleanly but is three weeks old is a monitoring failure, not a backup success.

## Disaster scenarios

| Scenario | Prevention | Recovery |
|---|---|---|
| Accidental `DELETE`/`DROP` | Least-privilege DB users, review destructive migrations | PITR to just before the statement |
| Server failure | Redundancy, IaC | Rebuild + restore; **RTO depends on this being rehearsed** |
| Data-centre outage | Multi-region or a documented alternative | Restore to another region |
| Ransomware | Immutable backups, least privilege, patching | Restore from an immutable copy |
| Corrupt backup | Verify after every backup | Fall back to an older backup |
| Deploy gone wrong | Staging, feature flags | Symlink rollback |
| Credentials leaked | Secret scanning, rotation | Rotate everything, audit access logs |
| Provider account lost | Backups at a **second provider** | Restore elsewhere |

The last row is the one people skip. If every backup lives in the same cloud account as
production, a billing dispute or a compromised root account takes both.

## Runbook

Keep it **in the repository**, so it is versioned and findable — not in a wiki nobody can
reach when SSO is down.

```markdown
# Runbook: database restore

**RTO target:** 1 hour   **RPO target:** 1 hour
**Owner:** Platform team   **Last tested:** 2026-07-15 (took 42 min)

## Contacts
- On-call: +63 xxx xxx xxxx
- Hosting support: ...
- DPO (if personal data is involved): ...

## 1. Assess (5 min)
- [ ] What is lost? Whole DB, one table, or specific rows?
- [ ] When did it happen? Check the audit log and the deploy timeline.
- [ ] Is it still happening? Stop it before restoring.

## 2. Contain (5 min)
- [ ] `php artisan down --secret=...` to stop further writes
- [ ] Notify the team and update the status page

## 3. Restore (30 min)
- [ ] Identify the last good backup: `php artisan backup:list`
- [ ] Download and decrypt
- [ ] Restore to a SCRATCH database first, never over production
- [ ] Verify row counts and the newest timestamp
- [ ] Replay the binlog to the target moment if PITR applies
- [ ] Swap the application to the restored database

## 4. Verify (10 min)
- [ ] Log in
- [ ] Complete a critical user journey
- [ ] Check the newest records look right
- [ ] `php artisan up`

## 5. Follow up
- [ ] Post-incident review within 48 hours
- [ ] Notify affected users if required
- [ ] If personal data was exposed: assess NPC notification obligations (RA 10173)
- [ ] Add a control so it cannot recur
```

Write it before you need it. Writing a runbook during an incident is how incidents get
longer.

## High availability — when the budget justifies it

| Tier | Setup | RTO | RPO |
|---|---|---|---|
| Basic | One server + daily backups | Hours | 24 h |
| Standard | LB + 2 app servers, managed DB with automated backups | Minutes | 1 h |
| High | Multi-AZ, read replicas, automatic failover | Seconds | Near 0 |
| Critical | Multi-region, active-active | Seconds | Near 0 |

Most projects need Standard. Multi-region active-active is expensive, complex, and
introduces failure modes of its own — adopt it only when the business case is explicit.

The cheapest large improvement for most teams: **move to a managed database**. Automated
backups, PITR, and failover for a monthly fee, versus a person's time and a restore
procedure nobody has rehearsed.

## Compliance

Backups contain personal data, so they are in scope for privacy law.

- Encrypted at rest and in transit
- Access controlled and logged
- Retention matched to your policy — indefinite backups conflict with data-minimisation
- **Erasure requests**: you generally cannot surgically delete from a backup. The accepted
  approach is a documented backup-retention window plus a process that re-applies erasure
  if a backup is ever restored. Write that down; it is what an auditor will ask for.
- Cross-border storage disclosed in the privacy notice

See `laravel-security/references/data-privacy-ph.md`.

## Monitoring

```php
Schedule::command('backup:monitor')->dailyAt('08:00');
```

Alert on:
- No backup in the last 26 hours (**critical**)
- Backup size deviating more than ~20% from the trend — a sudden shrink means the dump
  failed partway
- Backup destination approaching its quota
- The quarterly restore drill overdue

A backup job that has been failing for three weeks with nobody noticing is the most common
version of "we had backups".
