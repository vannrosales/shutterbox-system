# Disaster recovery drill

Run quarterly. **An untested backup is a hope, not a backup.**

**Date:** ____________  **Run by:** ____________  **Environment:** ____________

## Targets

| Target | Agreed | Actual (this drill) | Met? |
|---|---|---|---|
| RPO — acceptable data loss | ________ | ________ | ☐ |
| RTO — acceptable downtime | ________ | ________ | ☐ |

If the actual exceeds the agreed target, you do not have that target — you have a document
that says so. Either invest to close the gap, or revise the target with the business.

## 1. Preparation

- [ ] A clean environment is available (scratch VM or container)
- [ ] The runbook is accessible **without** production systems (not in a wiki behind SSO
      that may be down)
- [ ] Backup credentials available and separate from the application's credentials
- [ ] Team informed this is a drill

## 2. Locate the backup

- [ ] `php artisan backup:list` (or list the destination bucket)
- [ ] Take the **latest** backup, not a known-good older one — the drill must test what you
      would actually restore
- [ ] Record its timestamp: ____________
- [ ] Age at time of drill: ________ hours
- [ ] Size, compared with the trend: ________ (a sudden shrink means a partial dump)

Start the clock now: __________

## 3. Retrieve and decrypt

- [ ] Downloaded successfully
- [ ] Decrypted with `BACKUP_ARCHIVE_PASSWORD`
- [ ] Archive contents as expected (database dump + files)

Time taken: ________

## 4. Restore the database

```bash
gunzip < db-dumps/mysql-app_production.sql.gz | mysql app_restored
```

- [ ] Restored into a **scratch** database, never over production
- [ ] No errors during import
- [ ] Time taken: ________

### Verify

```sql
SELECT COUNT(*) FROM users;
SELECT COUNT(*) FROM orders;
SELECT MAX(created_at) FROM orders;
```

- [ ] Row counts plausible vs production
- [ ] Newest record timestamp: ____________
- [ ] **Data loss window** (production now − newest restored record): ________
- [ ] Within RPO? ☐

## 5. Point-in-time recovery (if configured)

- [ ] Binary logs available for the required window
- [ ] Replayed to a chosen moment successfully
- [ ] Resulting data loss window: ________

```bash
mysqlbinlog --stop-datetime="YYYY-MM-DD HH:MM:SS" mysql-bin.NNNNNN | mysql app_restored
```

## 6. Restore files

- [ ] User uploads restored
- [ ] Spot-checked: a known file opens correctly
- [ ] File count plausible
- [ ] Time taken: ________

## 7. Boot the application

- [ ] `.env` reconstructed (from the secrets manager, **not** from the backup)
- [ ] `php artisan migrate:status` — schema matches the code
- [ ] Application starts without error
- [ ] Time taken: ________

## 8. Functional verification

- [ ] Log in as a real user
- [ ] Complete a critical journey end to end
- [ ] Recent records display correctly
- [ ] Uploaded files load
- [ ] A queued job processes
- [ ] Scheduled tasks are registered

**Stop the clock: __________  Total elapsed: ________**

- [ ] Within RTO? ☐

## 9. Findings

| # | Issue | Impact | Owner | Due |
|---|---|---|---|---|
| 1 | | | | |
| 2 | | | | |
| 3 | | | | |

Common findings worth checking explicitly:

- [ ] Runbook step missing or wrong
- [ ] A credential nobody had
- [ ] Backup older than expected (monitoring gap)
- [ ] Restore slower than expected
- [ ] A dependency not covered by the backup (search index, cache warm-up, third-party
      config)
- [ ] `.env` reconstruction unclear
- [ ] File backup incomplete

## 10. Scenario tabletop

Walk through these on paper. For each: do we have a plan, and is it written down?

| Scenario | Plan exists | Tested |
|---|---|---|
| Accidental `DELETE` / `DROP` on production | ☐ | ☐ |
| Whole server lost | ☐ | ☐ |
| Data-centre / region outage | ☐ | ☐ |
| Ransomware encrypts the application server | ☐ | ☐ |
| Latest backup is corrupt | ☐ | ☐ |
| Cloud account lost (billing, compromise) | ☐ | ☐ |
| Production credentials leaked | ☐ | ☐ |
| Deploy corrupts data | ☐ | ☐ |

The "cloud account lost" row is the one most often unplanned. If every backup lives in the
same account as production, a billing dispute or a compromised root account takes both.

## 11. Backup health

- [ ] `backup:monitor` scheduled and alerting on age
- [ ] Dead-man's-switch ping configured (catches a silently stopped scheduler)
- [ ] Backups are **off-site**, not on the same server
- [ ] Encrypted at rest
- [ ] Bucket versioning enabled
- [ ] Object lock / immutability considered — the app's credential must not be able to
      delete backups
- [ ] Retention policy matches obligations
- [ ] A second provider or region holds a copy

## 12. Privacy

- [ ] Restored data handled under the same controls as production
- [ ] Scratch environment destroyed after the drill
- [ ] No production personal data left in a non-production environment
- [ ] Backup retention window documented for erasure-request purposes (RA 10173)

## Sign-off

- [ ] Findings logged with owners and due dates
- [ ] Runbook updated with anything learned
- [ ] Next drill scheduled: ____________

Signed: ____________  Date: ____________
