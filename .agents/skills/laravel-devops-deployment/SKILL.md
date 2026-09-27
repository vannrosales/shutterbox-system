---
name: laravel-devops-deployment
description: Use when setting up deployment, Docker, Nginx or Apache, PHP-FPM, Redis, queue workers, Horizon, Supervisor, the scheduler, CI/CD pipelines, SSL, monitoring, logging, backups, or disaster recovery. Covers VPS and Hostinger-style shared hosting through to containerised production. Triggers on "deploy", "Docker", "nginx", "server", "CI", "GitHub Actions", "production", "SSL", "backup", "monitoring", "supervisor", "horizon", "cron", or any infrastructure question.
---

# DevOps & Deployment

The application is not done when it works locally. It is done when it runs unattended,
recovers from failure, and can be rolled back.

## The deploy sequence

```bash
php artisan down --render="errors::503" --retry=60 --secret="$BYPASS"   # only if unavoidable

composer install --no-dev --optimize-autoloader --no-interaction --prefer-dist
npm ci && npm run build

php artisan migrate --force
php artisan optimize                 # config + route + view + event cache
php artisan storage:link

php artisan queue:restart            # workers must reload the new code
php artisan horizon:terminate        # if using Horizon

php artisan up
```

**`queue:restart` is the step people forget.** `queue:work` boots the framework once and
keeps it in memory — without a restart, workers run the *old* code indefinitely.

Better: design migrations to be backwards compatible (`laravel-database-scale`) so
`php artisan down` is never needed. Zero-downtime deploys use atomic symlink switching —
see `references/deployment.md`.

## Production environment

```ini
APP_ENV=production
APP_DEBUG=false                      # true exposes env vars and DB credentials
APP_URL=https://example.com

LOG_CHANNEL=stack
LOG_LEVEL=warning                    # info/debug fills the disk

DB_CONNECTION=mysql
CACHE_STORE=redis
SESSION_DRIVER=redis                 # 'file' breaks behind a load balancer
QUEUE_CONNECTION=redis
SESSION_SECURE_COOKIE=true
```

Non-negotiable checks:

```bash
composer install --no-dev            # Telescope/Debugbar/Ignition must not ship
curl -I https://example.com/.env     # must be 403/404
php artisan config:cache             # then verify no env() outside config/
```

## PHP-FPM sizing

```ini
pm = dynamic
pm.max_children = 40                 # (RAM_available_MB / avg_process_MB)
pm.start_servers = 10
pm.min_spare_servers = 5
pm.max_spare_servers = 15
pm.max_requests = 500                # recycle to bound memory leaks

request_terminate_timeout = 60s
```

Measure `avg_process_MB` on the real app (`ps aux | grep php-fpm`), typically 40–80MB.
Setting `max_children` above what RAM allows causes swapping, which is worse than queuing.

```ini
; OPcache — the single biggest PHP performance setting
opcache.enable=1
opcache.memory_consumption=256
opcache.max_accelerated_files=20000
opcache.validate_timestamps=0        ; production only; reset on deploy
```

`validate_timestamps=0` means PHP never checks whether files changed — so a deploy must
reload FPM or call `opcache_reset()`.

## Nginx essentials

```nginx
server {
    listen 443 ssl http2;
    root /var/www/app/current/public;    # NEVER the project root

    index index.php;
    charset utf-8;

    client_max_body_size 12m;
    client_body_timeout 10s;             # Slowloris defence
    client_header_timeout 10s;

    location / { try_files $uri $uri/ /index.php?$query_string; }

    location ~ \.php$ {
        fastcgi_pass unix:/run/php/php8.4-fpm.sock;
        fastcgi_param SCRIPT_FILENAME $realpath_root$fastcgi_script_name;
        include fastcgi_params;
        fastcgi_hide_header X-Powered-By;
    }

    location ~ /\.(?!well-known).* { deny all; }    # .env, .git, .htaccess

    location ~* \.(css|js|jpg|png|webp|avif|woff2)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
        access_log off;
    }
}
```

Full config with rate limiting, compression, and security headers:
`templates/nginx.conf`.

## Queue workers and the scheduler

Both must be supervised. A worker that dies silently is a queue that stops.

```ini
; /etc/supervisor/conf.d/worker.conf
[program:laravel-worker]
command=php /var/www/app/current/artisan queue:work redis --queue=high,default --tries=3 --max-time=3600
numprocs=4
autostart=true
autorestart=true
stopwaitsecs=3600                    ; MUST exceed the longest job timeout
user=www-data
```

```cron
* * * * * cd /var/www/app/current && php artisan schedule:run >> /dev/null 2>&1
```

**One cron entry only.** Laravel dispatches everything else from
`routes/console.php`. Multiple cron entries for individual commands is the mistake that
causes duplicate runs.

`retry_after` in `config/queue.php` must **exceed** the longest job timeout, or a job is
retried while still running — the most confusing class of queue bug.

Horizon replaces manual worker config for Redis queues and gives metrics, failure tracking,
and auto-balancing. Use it. Protect its dashboard with a gate.

## Backups — untested backups are hopes

```bash
composer require spatie/laravel-backup
```

```php
Schedule::command('backup:run')->dailyAt('01:00');
Schedule::command('backup:clean')->dailyAt('02:00');
Schedule::command('backup:monitor')->dailyAt('08:00');   // alerts if a backup is missing
```

Requirements:
- Database **and** user-uploaded files
- Off-site (S3/R2), not just the same server
- Encrypted at rest
- Retention: daily 7, weekly 4, monthly 6 (tune to obligation)
- **A restore performed and timed at least quarterly**

A backup you have never restored has an unknown success rate. Write the restore procedure
down and run it — see `checklists/disaster-recovery.md`.

## Monitoring

| Signal | Alert when |
|---|---|
| Uptime (`/up`) | Down for 2 checks |
| Error rate | Above baseline |
| p95 response time | > 1s |
| Queue depth / oldest job age | Above capacity |
| Failed jobs | Any increase |
| Disk | > 80% |
| Memory / CPU | Sustained > 85% |
| DB connections | > 80% of `max_connections` |
| Certificate expiry | < 14 days |
| Backup age | > 26 hours |

Someone must receive these. An alert nobody reads is a log line.

```php
// Structured logs, correlated by request id
Log::info('Invoice refunded', ['invoice' => $id, 'request_id' => Context::get('request_id')]);
```

Log to stdout in containers; to daily files with rotation on a VPS. Never log secrets or
PII (`laravel-security`).

## Hostinger and shared hosting

Common in the Philippine market. Constraints and the realistic workarounds:

| Constraint | Workaround |
|---|---|
| No root, no Supervisor | Cron-based worker restart every minute with `--max-time=60` |
| Web root is `public_html` | Point the domain at `app/public`, or symlink |
| No Redis | `database` cache/queue driver; add a prune schedule |
| Limited SSH | Git-based deploy via a webhook, or the control panel's deploy hook |
| No `exec` for some functions | Avoid `Process`; use PHP-native alternatives |

VPS is strongly preferable once queues, Redis, or real worker supervision matter. Full
guidance: `references/hosting.md`.

## Scope boundaries

Owns: servers, containers, web server config, workers, CI/CD, TLS, monitoring, logging,
backups, disaster recovery.

Does not own: application caching strategy (`laravel-performance`); schema and migration
safety (`laravel-database-scale`); application-level security controls
(`laravel-security` — this skill implements the infrastructure half); test content
(`laravel-testing-qa`).

## Bundled resources

- `references/deployment.md` — zero-downtime, Forge/Envoyer/Deployer, rollback
- `references/docker.md` — images, compose, multi-stage builds, production containers
- `references/servers.md` — Nginx, Apache, PHP-FPM, Redis, MySQL tuning
- `references/ci-cd.md` — GitHub Actions pipeline, environments, secrets, gates
- `references/observability.md` — logging, metrics, alerting, tracing, Pulse
- `references/backups-dr.md` — backup design, restore drills, RTO/RPO, runbooks
- `references/hosting.md` — Hostinger, shared hosting, VPS, managed platforms
- `templates/` — Dockerfile, compose, nginx.conf, supervisor, deploy script, CI workflow
- `checklists/deployment.md` — pre-deploy and post-deploy gates
- `checklists/disaster-recovery.md` — the drill

---
Last reviewed: 2026-07-31 · See MAINTENANCE.md
