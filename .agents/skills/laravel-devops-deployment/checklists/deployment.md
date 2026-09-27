# Deployment checklist

## Before the first production deploy

### Configuration

- [ ] `APP_ENV=production`, `APP_DEBUG=false`
- [ ] `APP_KEY` set, unique to this environment, not in the repository
- [ ] `APP_URL` correct and using https
- [ ] `LOG_LEVEL=warning` (debug fills the disk within days)
- [ ] `SESSION_DRIVER=redis`/`database` — **not** `file` behind a load balancer
- [ ] `SESSION_SECURE_COOKIE=true`
- [ ] `CACHE_STORE` and `QUEUE_CONNECTION` set to redis (or database on shared hosting)
- [ ] `.env` permissions 600, owned by the deploy user
- [ ] No `env()` calls outside `config/`

```bash
grep -rn --include="*.php" "env(" app/ routes/ database/     # must be empty
```

### Exposure

- [ ] Web root is `public/`, never the project root
- [ ] `composer install --no-dev` — Telescope, Debugbar, Ignition not installed
- [ ] Directory listing disabled
- [ ] `X-Powered-By` and server version suppressed

```bash
for p in .env .git/config composer.json storage/logs/laravel.log telescope; do
  echo -n "$p → "; curl -s -o /dev/null -w "%{http_code}\n" "https://example.com/$p"
done
```

All must be 403 or 404.

### Server

- [ ] PHP version matches `composer.json`
- [ ] All required extensions installed
- [ ] OPcache enabled, `validate_timestamps=0`, `save_comments=1`
- [ ] `pm.max_children` sized against real memory (not the default)
- [ ] `request_terminate_timeout` set
- [ ] `max_input_vars` set (an unbounded POST is a cheap DoS)
- [ ] Nginx/Apache config reviewed against `templates/nginx.conf`
- [ ] Rate limiting and body/header timeouts configured
- [ ] Compression enabled (Brotli + gzip)
- [ ] `storage/` and `bootstrap/cache` writable by the web user
- [ ] Firewall: only 22/80/443 inbound; MySQL and Redis not world-reachable

### TLS

- [ ] Valid certificate installed
- [ ] HTTP redirects to HTTPS
- [ ] Auto-renewal configured **and tested** (`certbot renew --dry-run`)
- [ ] HSTS enabled (start with a short `max-age`, then raise)
- [ ] Alert configured for expiry under 14 days

### Workers and scheduler

- [ ] Queue workers supervised (Supervisor/Horizon/systemd)
- [ ] `stopwaitsecs` exceeds the longest job timeout
- [ ] `retry_after` in `config/queue.php` exceeds the longest job timeout
- [ ] Queues separated by priority
- [ ] `--max-time` set to recycle workers
- [ ] **Exactly one** cron entry: `schedule:run`
- [ ] Only one node runs the scheduler (or `->onOneServer()`)
- [ ] Horizon dashboard behind an authorization gate

### Data

- [ ] Backups configured, off-site, encrypted
- [ ] `backup:monitor` scheduled and alerting
- [ ] **A restore has been performed and timed**
- [ ] Retention policy set
- [ ] Prune jobs scheduled (`model:prune`, `queue:prune-failed`, `pulse:trim`)

### Monitoring

- [ ] Uptime monitor on `/up` from at least two regions
- [ ] Error tracking installed with PII scrubbing
- [ ] Pulse or an APM reporting
- [ ] Log rotation configured
- [ ] Alerts defined for: error rate, p95 latency, queue depth, failed jobs, disk,
      memory, DB connections, certificate expiry, backup age
- [ ] **Someone receives those alerts and knows what to do**

### Documentation

- [ ] Deploy procedure written down
- [ ] Rollback procedure written down and **tested**
- [ ] Runbook in the repository, not a wiki
- [ ] On-call contacts recorded

---

## Every deploy — before

- [ ] CI green: tests, static analysis, security, style
- [ ] Reviewed and approved
- [ ] Migrations backwards compatible with the running code
- [ ] No long data backfill inside a migration
- [ ] Destructive change? Verified backup taken first
- [ ] Breaking API change? Versioned, with a migration guide
- [ ] Risky feature? Behind a flag
- [ ] Deployed to staging and verified
- [ ] Team notified if the change is significant
- [ ] Someone available to watch and roll back

## Every deploy — the sequence

- [ ] Dependencies installed with `--no-dev --optimize-autoloader`
- [ ] Assets built
- [ ] `php artisan migrate --force --isolated`
- [ ] `php artisan optimize`
- [ ] Symlink switched (or containers rolled)
- [ ] **PHP-FPM reloaded** (required with `validate_timestamps=0`)
- [ ] **`php artisan queue:restart`** (workers hold old code otherwise)
- [ ] `php artisan horizon:terminate` if applicable
- [ ] Old releases pruned

## Every deploy — after

- [ ] `/up` returns 200
- [ ] A real user journey works
- [ ] Security headers still present
- [ ] `.env` still unreachable
- [ ] Error rate normal (watch 15 minutes)
- [ ] p95 latency normal
- [ ] Queue draining; no failed-job spike
- [ ] Backfill job (if any) completed **and its result verified**
- [ ] No new entries in the slow query log

```bash
curl -fsS https://example.com/up
curl -sI https://example.com | grep -qi 'strict-transport-security'
test "$(curl -s -o /dev/null -w '%{http_code}' https://example.com/.env)" != "200"
php artisan queue:failed
```

---

## If something goes wrong

- [ ] Roll back the symlink (seconds)
- [ ] Reload PHP-FPM
- [ ] `php artisan queue:restart`
- [ ] Verify `/up`
- [ ] **Then** investigate

Rolling back first is correct. Diagnosing a live outage takes longer than restoring
service, and the logs will still be there afterwards.

Schema rollback is the hard part — which is why expand/contract migrations matter
(`laravel-database-scale`).

---

## The five most common deploy failures

| Symptom | Cause |
|---|---|
| "My change isn't live" | OPcache not reloaded, or `queue:restart` missing |
| Config values are null | `env()` outside `config/` after `config:cache` |
| 500 immediately after deploy | `storage/` or `bootstrap/cache` not writable |
| Scheduled jobs run twice | More than one cron entry, or two scheduler nodes |
| Sessions lost | `file` session driver behind a load balancer |
