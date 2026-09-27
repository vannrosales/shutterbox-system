# Maintaining `laravel-devops-deployment`

## Review triggers

| Trigger | Action |
|---|---|
| PHP minor/major release | Update FPM socket paths, extension names, `php.ini` values |
| Nginx / MySQL / Redis major release | Verify directives still exist and defaults have not moved |
| Docker base image changes | Rebuild and re-verify the multi-stage build |
| A deploy causes an incident | Add the specific check to `checklists/deployment.md` |
| A restore drill reveals a gap | Update `references/backups-dr.md` and the runbook template |
| Hosting provider changes its constraints | Update `references/hosting.md` |
| GitHub Actions deprecates a runner or action version | Update `references/ci-cd.md` |

Scheduled: **every 3 months** — shorter than most skills. Infrastructure guidance goes
stale faster than application guidance because it names specific versions, paths, and
provider behaviour.

## The parts most likely to be wrong

**1. Version-specific paths.** `php8.4-fpm.sock`, `/etc/php/8.4/`, `php:8.4-fpm-alpine` —
every one of these is wrong the moment the project moves PHP version. When updating, search
across all files:

```powershell
Select-String -Path .\**\*.md,.\templates\* -Pattern '8\.4' | Select-Object Path,LineNumber,Line
```

**2. Sizing numbers.** `pm.max_children = 40`, `innodb_buffer_pool_size = 4G`,
`maxmemory 1gb` are illustrative, and the files say to measure. **Keep that framing.** A
copied number applied to a 2GB VPS causes swapping, which is worse than the default.

**3. Provider specifics.** Cloudflare IP ranges, Hostinger's panel capabilities, AWS region
names. These change without notice. `references/hosting.md` deliberately avoids quoting
prices for the same reason.

**4. The `latest` vs SHA advice for images.** Registry and orchestrator conventions move;
the underlying rule (tag with the commit SHA so rollback is unambiguous) does not.

## What to update where

| Change | File |
|---|---|
| Deploy mechanics, rollback | `references/deployment.md` + `templates/deploy.sh` |
| Containers | `references/docker.md` + `templates/Dockerfile` |
| Web server, PHP-FPM, MySQL, Redis, Supervisor | `references/servers.md` + `templates/nginx.conf`, `templates/supervisor.conf` |
| Pipelines | `references/ci-cd.md` |
| Logging, metrics, alerting | `references/observability.md` |
| Backups, DR, runbooks | `references/backups-dr.md` + `checklists/disaster-recovery.md` |
| Hosting options and constraints | `references/hosting.md` |

The deploy sequence appears in `SKILL.md`, `references/deployment.md`,
`templates/deploy.sh`, and `checklists/deployment.md`. Change all four together, or the
library starts recommending two different sequences.

## Testing changes to this skill

1. Skill loads: `/laravel-devops-deployment`
2. Prompt test — *"My deploy went through but the code didn't change"* — verify the answer
   is OPcache reload **and** `queue:restart`, not "clear the cache"
3. Second prompt test — *"Set up queue workers on Hostinger shared hosting"* — verify it
   gives the cron + `--stop-when-empty --max-time` pattern, not a Supervisor config that
   cannot be installed
4. Third prompt test — *"Do we have backups?"* — verify the answer distinguishes "backups
   exist" from "a restore has been performed and timed"
5. Scripts and configs parse:

```bash
bash -n .claude/skills/laravel-devops-deployment/templates/deploy.sh
docker build -f .claude/skills/laravel-devops-deployment/templates/Dockerfile --check .
nginx -t -c /path/to/copied/nginx.conf     # requires the surrounding http{} block
```

`deploy.sh` should also be run end-to-end against a scratch VM at least once before it is
recommended to a project.

## Boundary discipline

Owns: servers, containers, web server and PHP-FPM configuration, worker supervision, CI/CD
pipelines, TLS, monitoring and alerting, logging infrastructure, backups, disaster
recovery, hosting selection.

Hand off:
- Application caching strategy, what to cache → `laravel-performance`
- Schema design and migration safety → `laravel-database-scale`
- Application-level security controls → `laravel-security`
- What tests to write → `laravel-testing-qa`
- Code style and static analysis configuration → `laravel-code-quality`

**Shared areas that must stay consistent:**

| Topic | This skill owns | Other skill owns |
|---|---|---|
| Rate limiting | Nginx `limit_req`, CDN, WAF | `RateLimiter` definitions and business-action limits (`laravel-security`) |
| OPcache | The `php.ini` settings and the deploy reload | Why it matters for throughput (`laravel-performance`) |
| Redis eviction policy | `maxmemory-policy`, separate databases | Cache key design and TTLs (`laravel-performance`) |
| Queue workers | Supervisor, Horizon config, sizing | Job design, idempotency, batching (`laravel-performance`) |
| `X-Accel-Redirect` | The Nginx `internal` location | The authorizing controller (`laravel-media-management`) |
| Migrations in deploy | `--force --isolated`, ordering | Whether the migration is safe to run online (`laravel-database-scale`) |
| CI test job | Runner, services, caching | Test content and coverage policy (`laravel-testing-qa`) |
| Secrets in CI | Deploy credentials, environment scoping | Application secret management and rotation (`laravel-security`) |

Each row is the infrastructure half of a rule whose application half lives elsewhere. If
one changes, check the other.

## The three claims this skill must keep honest

1. **`queue:restart` and the FPM reload are not optional.** Both appear in the deploy
   sequence, the script, and the checklist. Every "my change isn't live" report traces to
   one of them. Do not let an edit soften this.

2. **A backup that has never been restored has an unknown success rate.** The DR checklist
   exists to make that measurable. If an edit turns the restore drill into a
   nice-to-have, it is wrong.

3. **Sizing numbers must be measured, not copied.** Every example that names a number also
   names the way to derive it. Keep both.

## Shared hosting guidance

`references/hosting.md` gives real workarounds for shared hosting rather than saying "use a
VPS". That is deliberate — it reflects the actual constraints many Philippine projects
operate under, and a skill that only describes the ideal setup is unusable there.

It also states plainly when to leave shared hosting. Keep both halves: the workarounds and
the exit criteria.

## Changelog

| Date | Change |
|---|---|
| 2026-07-31 | Initial version. PHP 8.4, Nginx, MySQL 8.4, Redis 7, GitHub Actions, Docker multi-stage, Hostinger/VPS guidance. |
