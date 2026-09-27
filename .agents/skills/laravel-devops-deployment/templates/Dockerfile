# syntax=docker/dockerfile:1
#
# Production Laravel image — multi-stage.
#
# Never bake .env or run config:cache at build time: secrets end up in an image
# layer, and build-time env values freeze into production. Both belong in the
# entrypoint.

# ════════════════════════════════════════════════════════════════════════════
#  Stage 1 — Composer dependencies
# ════════════════════════════════════════════════════════════════════════════
FROM composer:2 AS vendor

WORKDIR /app

# Copy only the lock files first, so this layer stays cached until dependencies
# actually change.
COPY composer.json composer.lock ./

# --no-scripts: artisan isn't present yet. Scripts run after the full copy.
# --no-dev: Telescope, Debugbar, and Ignition must NEVER reach production.
RUN composer install \
        --no-dev --no-scripts --no-autoloader \
        --prefer-dist --no-interaction --no-progress

COPY . .

RUN composer dump-autoload --optimize --classmap-authoritative --no-dev

# ════════════════════════════════════════════════════════════════════════════
#  Stage 2 — Frontend assets
# ════════════════════════════════════════════════════════════════════════════
FROM node:22-alpine AS assets

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY resources ./resources
COPY vite.config.js ./
COPY tailwind.config.js postcss.config.js ./

RUN npm run build

# ════════════════════════════════════════════════════════════════════════════
#  Stage 3 — Runtime
# ════════════════════════════════════════════════════════════════════════════
FROM php:8.4-fpm-alpine AS runtime

# Build deps are installed, used, then removed in the same layer so they never
# ship. Alpine keeps the image ~120MB vs ~500MB for Debian — but verify your
# extensions, some assume glibc. php:8.4-fpm-bookworm is the safe alternative.
RUN apk add --no-cache \
        icu-libs libzip libpng libjpeg-turbo libwebp freetype oniguruma \
    && apk add --no-cache --virtual .build-deps \
        $PHPIZE_DEPS icu-dev libzip-dev libpng-dev libjpeg-turbo-dev \
        libwebp-dev freetype-dev oniguruma-dev linux-headers \
    && docker-php-ext-configure gd --with-jpeg --with-webp --with-freetype \
    && docker-php-ext-install -j"$(nproc)" \
        pdo_mysql bcmath intl zip gd opcache pcntl exif \
    && pecl install redis \
    && docker-php-ext-enable redis \
    && apk del .build-deps \
    && rm -rf /tmp/pear

COPY docker/php/app.ini     /usr/local/etc/php/conf.d/zz-app.ini
COPY docker/php/opcache.ini /usr/local/etc/php/conf.d/zz-opcache.ini
COPY docker/php/fpm.conf    /usr/local/etc/php-fpm.d/zz-app.conf

WORKDIR /var/www/html

COPY --from=vendor --chown=www-data:www-data /app ./
COPY --from=assets --chown=www-data:www-data /app/public/build ./public/build

COPY --chown=www-data:www-data docker/entrypoint.sh /usr/local/bin/entrypoint
RUN chmod +x /usr/local/bin/entrypoint

RUN chown -R www-data:www-data storage bootstrap/cache \
    && chmod -R 775 storage bootstrap/cache

# Never run as root. A container escape from root is a host compromise.
USER www-data

EXPOSE 9000

HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --retries=3 \
    CMD php -r 'exit(0);' || exit 1

ENTRYPOINT ["entrypoint"]
CMD ["php-fpm"]

# ════════════════════════════════════════════════════════════════════════════
#  docker/entrypoint.sh
# ════════════════════════════════════════════════════════════════════════════
#
#   #!/bin/sh
#   set -e
#
#   # Caching happens at RUNTIME, not build time — env values must come from
#   # the actual environment, not from whatever existed during the build.
#   php artisan config:cache
#   php artisan route:cache
#   php artisan view:cache
#   php artisan event:cache
#
#   # Only ONE container should migrate. --isolated takes an advisory lock so
#   # concurrent starts cannot race into a partial migration.
#   if [ "$RUN_MIGRATIONS" = "true" ]; then
#       php artisan migrate --force --isolated
#   fi
#
#   exec "$@"
#
# ════════════════════════════════════════════════════════════════════════════
#  docker/php/opcache.ini
# ════════════════════════════════════════════════════════════════════════════
#
#   opcache.enable=1
#   opcache.memory_consumption=256
#   opcache.interned_strings_buffer=16
#   opcache.max_accelerated_files=20000
#   opcache.validate_timestamps=0     ; immutable image — nothing changes at runtime
#   opcache.save_comments=1           ; REQUIRED: attributes/annotations need them
#
# ════════════════════════════════════════════════════════════════════════════
#  .dockerignore  — without this, node_modules and .git bloat the build context
#                   and .env risks landing in a layer
# ════════════════════════════════════════════════════════════════════════════
#
#   .git
#   .env
#   .env.*
#   node_modules
#   vendor
#   storage/logs/*
#   storage/framework/cache/*
#   tests
#   .github
#   docker-compose*.yml
#   *.md
#
# ════════════════════════════════════════════════════════════════════════════
#  Build and scan
# ════════════════════════════════════════════════════════════════════════════
#
#   docker build -t app:$(git rev-parse --short HEAD) .
#   docker scout cves app:latest
#   trivy image app:latest
#   dive app:latest                    # interactive layer explorer
#
# Tag with the commit SHA, not only `latest` — `latest` makes rollback
# ambiguous and "which version is running?" unanswerable.
# ════════════════════════════════════════════════════════════════════════════
