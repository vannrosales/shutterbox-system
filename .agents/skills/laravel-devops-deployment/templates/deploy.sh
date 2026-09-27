#!/usr/bin/env bash
#
# Zero-downtime deploy via atomic symlink switch.
#
#   /var/www/app/
#   ├── releases/20260731143000/
#   ├── shared/{.env,storage}
#   └── current -> releases/20260731143000
#
# The switch is one atomic `ln -sfn`, so no request ever sees a half-deployed tree.
#
# Usage:  ./deploy.sh [branch]

set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/app}"
REPO="${REPO:-git@github.com:org/app.git}"
BRANCH="${1:-main}"
PHP="${PHP_BIN:-php}"
FPM_SERVICE="${FPM_SERVICE:-php8.4-fpm}"
KEEP_RELEASES=5

TIMESTAMP=$(date +%Y%m%d%H%M%S)
RELEASE="$APP_DIR/releases/$TIMESTAMP"
SHARED="$APP_DIR/shared"
CURRENT="$APP_DIR/current"

log()  { printf '\033[0;34m==>\033[0m %s\n' "$1"; }
fail() { printf '\033[0;31mFAILED:\033[0m %s\n' "$1" >&2; exit 1; }

# On failure, remove the half-built release. `current` still points at the old
# one, so the site never stopped serving.
cleanup_on_failure() {
    if [ -d "$RELEASE" ] && [ "$(readlink -f "$CURRENT")" != "$RELEASE" ]; then
        log "Deploy failed — removing incomplete release"
        rm -rf "$RELEASE"
    fi
}
trap cleanup_on_failure ERR

# ── Preflight ───────────────────────────────────────────────────────────────

[ -f "$SHARED/.env" ] || fail "Missing $SHARED/.env"
[ -d "$SHARED/storage" ] || fail "Missing $SHARED/storage"

mkdir -p "$APP_DIR/releases"

# ── Fetch ───────────────────────────────────────────────────────────────────

log "Cloning $BRANCH into $TIMESTAMP"
git clone --depth 1 --branch "$BRANCH" "$REPO" "$RELEASE" --quiet
cd "$RELEASE"

echo "$(git rev-parse HEAD)" > "$RELEASE/REVISION"

# ── Shared state ────────────────────────────────────────────────────────────
# .env and storage live outside the release so they survive deploys and rollbacks.

log "Linking shared files"
ln -sfn "$SHARED/.env" "$RELEASE/.env"
rm -rf "$RELEASE/storage"
ln -sfn "$SHARED/storage" "$RELEASE/storage"

# ── Dependencies ────────────────────────────────────────────────────────────
# --no-dev is not optional: Telescope, Debugbar, and Ignition expose internals.

log "Installing PHP dependencies"
composer install \
    --no-dev --optimize-autoloader --classmap-authoritative \
    --no-interaction --prefer-dist --no-progress

if [ -f package-lock.json ]; then
    log "Building assets"
    npm ci --silent
    npm run build
    rm -rf node_modules          # not needed at runtime; saves ~200MB per release
fi

# ── Permissions ─────────────────────────────────────────────────────────────

chmod -R 775 "$RELEASE/bootstrap/cache"
chown -R "$(whoami)":www-data "$RELEASE/bootstrap/cache" 2>/dev/null || true

# ── Migrations ──────────────────────────────────────────────────────────────
# --isolated takes an advisory lock so concurrent deploys across nodes cannot
# race and produce a partial migration.
#
# Migrations MUST be backwards compatible with the currently-running code:
# during the switch, both versions are live. See laravel-database-scale.

log "Running migrations"
$PHP artisan migrate --force --isolated

# ── Caches ──────────────────────────────────────────────────────────────────
# After this, env() returns NULL outside config/ files.

log "Caching configuration"
$PHP artisan optimize                # config + route + view + event

[ -L "$RELEASE/public/storage" ] || $PHP artisan storage:link

# ── The atomic switch ───────────────────────────────────────────────────────

log "Switching to release $TIMESTAMP"
ln -sfn "$RELEASE" "$CURRENT"

# ── Reload runtimes ─────────────────────────────────────────────────────────
# BOTH of these are required, and both are commonly forgotten.

# With opcache.validate_timestamps=0, PHP never notices the changed files.
log "Reloading PHP-FPM"
sudo systemctl reload "$FPM_SERVICE" 2>/dev/null \
    || log "WARNING: could not reload $FPM_SERVICE — new code may not be active"

# queue:work holds the framework in memory and runs the OLD code until told to stop.
log "Restarting queue workers"
cd "$CURRENT"
$PHP artisan queue:restart
$PHP artisan horizon:terminate 2>/dev/null || true

# ── Prune old releases ──────────────────────────────────────────────────────
# Keep enough to roll back through a bad run of deploys.

log "Pruning old releases (keeping $KEEP_RELEASES)"
ls -1dt "$APP_DIR"/releases/* 2>/dev/null \
    | tail -n +$((KEEP_RELEASES + 1)) \
    | xargs -r rm -rf

# ── Verify ──────────────────────────────────────────────────────────────────

log "Smoke test"
APP_URL=$(grep -E '^APP_URL=' "$SHARED/.env" | cut -d= -f2- | tr -d '"')

if [ -n "$APP_URL" ]; then
    curl -fsS --max-time 10 "$APP_URL/up" > /dev/null \
        || fail "Health check failed — consider rolling back"

    # .env must never be fetchable over HTTP
    CODE=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$APP_URL/.env" || echo 000)
    [ "$CODE" = "200" ] && fail ".env is publicly reachable — the web root is misconfigured"
fi

log "Deployed $TIMESTAMP ($(cat "$RELEASE/REVISION" | cut -c1-8))"

# ─────────────────────────────────────────────────────────────────────────────
# ROLLBACK — have this ready BEFORE you need it.
#
#   ls -1dt /var/www/app/releases/*          # list, newest first
#   ln -sfn /var/www/app/releases/<ts> /var/www/app/current
#   sudo systemctl reload php8.4-fpm
#   cd /var/www/app/current && php artisan queue:restart
#
# Application rollback is seconds. SCHEMA rollback usually is not possible
# without data loss — which is why expand/contract migrations matter.
# ─────────────────────────────────────────────────────────────────────────────
