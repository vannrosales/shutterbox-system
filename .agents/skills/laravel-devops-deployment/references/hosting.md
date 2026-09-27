# Hosting options

## Choosing

| Option | Cost | Ops effort | Suits |
|---|---|---|---|
| **Shared hosting** (Hostinger, cPanel) | Lowest | Low | Small sites, brochureware, low-traffic CRUD |
| **VPS** (Hostinger VPS, DigitalOcean, Hetzner, Vultr) | Low–medium | Medium | Most applications |
| **Managed VPS** (Forge, Ploi, RunCloud on top of a VPS) | Medium | Low | Teams without an ops person |
| **PaaS** (Laravel Cloud, Fly.io, Render) | Medium–high | Very low | Fast delivery, small teams |
| **Serverless** (Vapor) | Usage-based | Low | Spiky traffic, no server management |
| **Kubernetes** | High | Very high | Multi-service platforms with a platform team |

The honest default for a Laravel application with queues: **a VPS managed by Forge**. It
removes almost all the work in `references/servers.md` for less than an hour of engineering
time per month.

Kubernetes for a single Laravel app is usually a mistake — the operational surface exceeds
the application's.

## Shared hosting (Hostinger and similar)

Very common in the Philippine market. Workable, with real constraints.

### Document root

The domain must point at `public/`, not the project root. Otherwise `.env`, `storage/`, and
`vendor/` are all fetchable over HTTP.

```
public_html/          ← domain points here
laravel/              ← project outside the web root
├── app/
├── .env
└── public/
```

If the panel cannot repoint the domain:

```bash
# Symlink approach
ln -s ~/laravel/public/* ~/public_html/
```

Or move `public/`'s contents to `public_html/` and edit `index.php`:

```php
require __DIR__.'/../laravel/vendor/autoload.php';
$app = require_once __DIR__.'/../laravel/bootstrap/app.php';
```

Then **verify**:

```bash
curl -I https://example.com/.env        # must be 403/404
curl -I https://example.com/storage/logs/laravel.log
```

This single check catches the most common and most severe shared-hosting misconfiguration.

### Queues without Supervisor

No root means no Supervisor. Use cron plus a bounded worker lifetime:

```cron
* * * * * cd ~/laravel && php artisan queue:work --stop-when-empty --max-time=55 >> /dev/null 2>&1
```

`--stop-when-empty --max-time=55` means the worker exits before the next minute's cron
fires, so processes do not accumulate. Latency is up to 60 seconds — acceptable for email,
not for anything interactive.

If the host allows only one cron entry:

```cron
* * * * * cd ~/laravel && php artisan schedule:run >> /dev/null 2>&1
```

```php
// routes/console.php
Schedule::command('queue:work --stop-when-empty --max-time=55')->everyMinute()->withoutOverlapping();
```

### No Redis

```ini
CACHE_STORE=database
SESSION_DRIVER=database
QUEUE_CONNECTION=database
```

```bash
php artisan make:queue-table && php artisan make:cache-table && php artisan session:table
php artisan migrate
```

```php
Schedule::command('cache:prune-stale-tags')->hourly();
Schedule::command('queue:prune-failed --hours=168')->daily();
```

The database driver works. It is slower and adds write load — fine at low volume, a problem
at scale. It is also the clearest signal that it is time to move to a VPS.

### Deploying

Most shared hosts offer a Git deploy hook in the panel. Otherwise:

```bash
# Locally, since composer/npm may be unavailable on the host
composer install --no-dev --optimize-autoloader
npm ci && npm run build

rsync -avz --delete \
  --exclude='.env' --exclude='storage/app' --exclude='.git' --exclude='node_modules' \
  ./ user@host:~/laravel/

ssh user@host 'cd ~/laravel && php artisan migrate --force && php artisan optimize'
```

Build locally, ship artefacts. Shared hosts frequently lack Composer, Node, or enough
memory to run them.

### Other constraints

| Constraint | Workaround |
|---|---|
| `exec`/`proc_open` disabled | Avoid `Process`; use PHP-native image handling |
| Low `memory_limit` | Cannot process large images — offload or move to a VPS |
| No `pcntl` | `queue:work` still runs; timeout handling is weaker |
| Shared MySQL with low `max_connections` | Keep worker count at 1–2 |
| No SSH | Panel file manager + Git hook; painful but workable |
| Unknown PHP version | Check `php -v`; some panels allow selection per domain |

### When to leave

Move to a VPS when any of these is true:

- Queues need latency under a minute
- Image or file processing is a core feature
- Traffic causes noisy-neighbour slowdowns
- You need Redis, Horizon, or real worker supervision
- Deploys need to be zero-downtime
- Compliance requires isolation or audit control

## VPS

```bash
# Baseline hardening on a fresh Ubuntu box
adduser deploy && usermod -aG sudo deploy
rsync --archive --chown=deploy:deploy ~/.ssh /home/deploy

# /etc/ssh/sshd_config
PermitRootLogin no
PasswordAuthentication no
systemctl restart sshd

ufw default deny incoming && ufw default allow outgoing
ufw allow 22,80,443/tcp && ufw enable

apt install -y fail2ban unattended-upgrades
dpkg-reconfigure --priority=low unattended-upgrades
```

Sizing:

| Traffic | vCPU | RAM | Notes |
|---|---|---|---|
| < 10k visits/mo | 1 | 2GB | App + DB on one box |
| 10k–100k | 2 | 4GB | Separate DB if it gets busy |
| 100k–1M | 4 | 8GB | Managed DB, Redis |
| > 1M | 4+ | 16GB+ | Load balancer, multiple app servers |

RAM matters more than CPU for Laravel — PHP-FPM children and the MySQL buffer pool both
want it. The single cheapest performance improvement on most VPS setups is more RAM for
`innodb_buffer_pool_size`.

Providers: Hetzner (best price/performance, EU/US), DigitalOcean (good tooling, has a
Singapore region), Vultr (Singapore + Manila-adjacent latency), Linode, Hostinger VPS.

For Philippine users, **Singapore** is the closest low-latency region on most providers.

## Managed platforms

### Laravel Forge

Provisions a VPS on your own cloud account, then manages Nginx, PHP, MySQL, Redis, queue
workers, the scheduler, SSL, and deploys. You keep root; Forge does the configuration.

The recommendation to make plainly: for a team without a dedicated ops person, this
eliminates most of `references/servers.md` for a modest monthly fee.

### Laravel Cloud / Vapor

Fully managed. Vapor is serverless on AWS Lambda — genuinely elastic, with real constraints:

- No persistent local filesystem (use S3)
- Cold starts
- 250MB deployment package limit
- Long-running jobs need care around Lambda's execution limits
- Costs scale with usage, which cuts both ways

Good fit for spiky traffic; poor fit for steady heavy load or long-running processing.

### Comparison of effort

| Task | Shared | VPS | Forge | PaaS |
|---|---|---|---|---|
| Provisioning | — | Manual | Automated | Automated |
| SSL | Panel | Certbot | Automatic | Automatic |
| Deploys | Manual/hook | Script | One click | Git push |
| Queue workers | Cron hack | Supervisor | Managed | Managed |
| Scaling | No | Manual | Manual | Automatic |
| Backups | Panel | Your job | Configurable | Included |
| Monitoring | Minimal | Your job | Basic | Included |
| Root access | No | Yes | Yes | No |

## Philippine considerations

**Latency.** Singapore is typically 30–60ms from Manila; US East is 200ms+. For an
interactive application serving Philippine users, region choice is the single largest
latency factor — larger than most application optimisation.

**CDN.** Cloudflare has Manila and Cebu points of presence. A CDN in front of a Singapore
origin gives most users near-local static asset delivery, and absorbs traffic before it
reaches the origin (`laravel-security`).

**Bandwidth.** Many users are on mobile data with real cost sensitivity. Budget under 1MB
per public page (`laravel-performance`), and test on a throttled connection.

**Payments.** PayMongo, Xendit, DragonPay, and GCash/Maya integrations are the local norm.
Webhook handling for these follows the standard rules — verify the signature before parsing,
deduplicate, respond fast (`laravel-api-standards`).

**Government hosting.** Public-sector projects may have data-residency requirements.
Confirm before choosing a region, and disclose cross-border storage in the privacy notice
(RA 10173).

**Connectivity.** Intermittent connections are normal. Design for it: save form progress,
warn before session timeout, and make retries safe (idempotency keys).
