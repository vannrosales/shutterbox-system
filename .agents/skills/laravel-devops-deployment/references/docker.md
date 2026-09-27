# Docker

## Multi-stage production image

```dockerfile
# syntax=docker/dockerfile:1

# ── Stage 1: Composer dependencies ──────────────────────────────────────────
FROM composer:2 AS vendor

WORKDIR /app
COPY composer.json composer.lock ./

# --no-scripts: artisan isn't present yet. Scripts run after the full copy.
RUN composer install \
      --no-dev --no-scripts --no-autoloader \
      --prefer-dist --no-interaction

COPY . .
RUN composer dump-autoload --optimize --classmap-authoritative

# ── Stage 2: Frontend assets ────────────────────────────────────────────────
FROM node:22-alpine AS assets

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

COPY resources ./resources
COPY vite.config.js tailwind.config.js postcss.config.js ./
RUN npm run build

# ── Stage 3: Runtime ────────────────────────────────────────────────────────
FROM php:8.4-fpm-alpine AS runtime

RUN apk add --no-cache \
        icu-dev libzip-dev libpng-dev libjpeg-turbo-dev libwebp-dev \
        freetype-dev oniguruma-dev linux-headers \
    && docker-php-ext-configure gd --with-jpeg --with-webp --with-freetype \
    && docker-php-ext-install -j$(nproc) \
        pdo_mysql bcmath intl zip gd opcache pcntl exif \
    && pecl install redis && docker-php-ext-enable redis \
    && apk del linux-headers

COPY docker/php/php.ini    /usr/local/etc/php/conf.d/app.ini
COPY docker/php/opcache.ini /usr/local/etc/php/conf.d/opcache.ini
COPY docker/php/fpm.conf   /usr/local/etc/php-fpm.d/zz-app.conf

WORKDIR /var/www/html

COPY --from=vendor --chown=www-data:www-data /app       ./
COPY --from=assets --chown=www-data:www-data /app/public/build ./public/build

RUN chown -R www-data:www-data storage bootstrap/cache \
    && chmod -R 775 storage bootstrap/cache

USER www-data

EXPOSE 9000

HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --retries=3 \
    CMD php-fpm-healthcheck || exit 1

CMD ["php-fpm"]
```

Points that matter:

- **Multi-stage** — Composer and Node never reach the final image. A single-stage build
  ships ~400MB of build tooling and a supply-chain surface.
- **`--no-dev`** — Telescope, Debugbar, and Ignition must not be in production.
- **`USER www-data`** — never run as root. A container escape from root is a host
  compromise.
- **`classmap-authoritative`** — no filesystem stat per class lookup.
- Alpine keeps the image small, but check your extensions work — some have glibc
  assumptions. `php:8.4-fpm-bookworm` is the safe alternative.

## What must NOT be baked into the image

```dockerfile
# ✗ Never
COPY .env .env
RUN php artisan config:cache
```

Baking `.env` puts secrets in every layer of the image, readable by anyone who can pull it.
`config:cache` at build time freezes build-time environment values into production.

Both belong in the entrypoint:

```bash
#!/bin/sh
# docker/entrypoint.sh
set -e

php artisan config:cache
php artisan route:cache
php artisan view:cache
php artisan event:cache

# Only the migration container should run this — see compose below
if [ "$RUN_MIGRATIONS" = "true" ]; then
    php artisan migrate --force --isolated
fi

exec "$@"
```

## `.dockerignore`

```
.git
.env
.env.*
node_modules
vendor
storage/logs/*
storage/framework/cache/*
tests
.github
docker-compose*.yml
*.md
```

Without this, the build context includes `node_modules` and `.git` — slow builds, and
`.env` risks ending up in an image layer.

## Compose — production shape

```yaml
services:
  app:
    build:
      context: .
      target: runtime
    restart: unless-stopped
    env_file: .env
    volumes:
      - storage:/var/www/html/storage
    depends_on:
      mysql:   { condition: service_healthy }
      redis:   { condition: service_healthy }
    healthcheck:
      test: ["CMD", "php-fpm-healthcheck"]
      interval: 30s

  nginx:
    image: nginx:1.27-alpine
    restart: unless-stopped
    ports: ["80:80", "443:443"]
    volumes:
      - ./docker/nginx/default.conf:/etc/nginx/conf.d/default.conf:ro
      - ./public:/var/www/html/public:ro
      - certs:/etc/letsencrypt:ro
    depends_on: [app]

  # Separate container, separate scaling, separate failure domain
  queue:
    build:
      context: .
      target: runtime
    restart: unless-stopped
    env_file: .env
    command: php artisan queue:work redis --queue=high,default --tries=3 --max-time=3600
    volumes:
      - storage:/var/www/html/storage
    depends_on:
      redis: { condition: service_healthy }
    deploy:
      replicas: 4

  scheduler:
    build:
      context: .
      target: runtime
    restart: unless-stopped
    env_file: .env
    # EXACTLY ONE replica, ever. Two schedulers = every job runs twice.
    command: php artisan schedule:work
    volumes:
      - storage:/var/www/html/storage

  mysql:
    image: mysql:8.4
    restart: unless-stopped
    environment:
      MYSQL_DATABASE: ${DB_DATABASE}
      MYSQL_USER: ${DB_USERNAME}
      MYSQL_PASSWORD: ${DB_PASSWORD}
      MYSQL_ROOT_PASSWORD: ${DB_ROOT_PASSWORD}
    volumes:
      - mysql:/var/lib/mysql
      - ./docker/mysql/my.cnf:/etc/mysql/conf.d/app.cnf:ro
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "localhost"]
      interval: 10s
      retries: 5

  redis:
    image: redis:7-alpine
    restart: unless-stopped
    command: redis-server --maxmemory 512mb --maxmemory-policy volatile-lru --appendonly yes
    volumes: [redis:/data]
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s

volumes:
  mysql:
  redis:
  storage:
  certs:
```

Three things to note:

1. **`scheduler` must never scale past 1.** Two schedulers means every scheduled job runs
   twice — including billing.
2. **`volatile-lru`, not `allkeys-lru`**, when Redis holds both cache and queue data.
   `allkeys-lru` will evict queued jobs under memory pressure.
3. **Shared `storage` volume** across app and queue containers — otherwise a file written
   by the web container is invisible to the worker. (Better still: use object storage and
   avoid the shared volume entirely.)

## `php artisan schedule:work` vs cron

In a container, `schedule:work` is a long-running process that behaves like the cron entry.
It is simpler than running cron inside a container, and it restarts cleanly.

## Development compose

```yaml
services:
  app:
    build:
      context: .
      target: runtime
    volumes:
      - .:/var/www/html        # bind mount for live editing
    environment:
      PHP_IDE_CONFIG: "serverName=app"
      XDEBUG_MODE: "debug"
```

```ini
; opcache in development
opcache.validate_timestamps=1
opcache.revalidate_freq=0
```

Bind mounts on macOS and Windows are slow. Use `:delegated`, exclude `vendor` and
`node_modules` with named volumes, or use Laravel Sail which handles this.

## FrankenPHP — worth considering

```dockerfile
FROM dunglas/frankenphp:php8.4

COPY --from=vendor /app /app
WORKDIR /app

ENV SERVER_NAME=:80
CMD ["frankenphp", "php-server", "--root", "/app/public"]
```

One process instead of Nginx + FPM, HTTP/3, and an optional worker mode that keeps the
framework booted (like Octane). Simpler topology; verify your extensions and any
state-leak assumptions before adopting worker mode.

## Image size

```bash
docker images app
docker history app --no-trunc | head -20
dive app                    # interactive layer explorer
```

| Base | Approximate size |
|---|---|
| `php:8.4-fpm` (Debian) | ~500MB |
| `php:8.4-fpm-alpine` | ~120MB |
| Multi-stage + Alpine | ~150MB with the app |
| Single-stage, no pruning | ~800MB+ |

Layer ordering matters — put rarely-changing steps first so the cache survives code
changes:

```dockerfile
COPY composer.json composer.lock ./     # changes rarely
RUN composer install ...                 # cached until the lock file changes
COPY . .                                 # changes every commit
```

## Security

```bash
docker scout cves app:latest
trivy image app:latest
```

- Run as a non-root user
- Pin base images to a digest for reproducibility: `php:8.4-fpm-alpine@sha256:...`
- Rebuild regularly — base images receive security patches
- Read-only root filesystem where possible:

```yaml
    read_only: true
    tmpfs:
      - /tmp
      - /var/www/html/storage/framework/cache
```

- Never `--privileged`
- Drop capabilities: `cap_drop: [ALL]`

## Registry and deploy

```yaml
- name: Build and push
  uses: docker/build-push-action@v6
  with:
    push: true
    tags: |
      ghcr.io/org/app:${{ github.sha }}
      ghcr.io/org/app:latest
    cache-from: type=gha
    cache-to: type=gha,mode=max
```

Tag with the commit SHA, not only `latest` — `latest` makes rollback ambiguous and makes
"which version is running?" unanswerable.

```bash
docker compose pull && docker compose up -d --no-deps app queue
```

For real zero-downtime with containers, use rolling updates in an orchestrator (Swarm,
Kubernetes, ECS) with health checks gating the cutover.
