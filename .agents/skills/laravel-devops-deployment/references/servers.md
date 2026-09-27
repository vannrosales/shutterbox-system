# Server configuration

## Nginx

```nginx
# /etc/nginx/sites-available/app
limit_req_zone  $binary_remote_addr zone=general:10m rate=30r/s;
limit_req_zone  $binary_remote_addr zone=login:10m   rate=2r/m;
limit_conn_zone $binary_remote_addr zone=conns:10m;

server {
    listen 80;
    server_name example.com www.example.com;
    return 301 https://example.com$request_uri;
}

server {
    listen 443 ssl;
    http2 on;
    server_name example.com;

    # NEVER the project root — that exposes .env, storage/, vendor/
    root /var/www/app/current/public;
    index index.php;
    charset utf-8;

    # ── TLS ──────────────────────────────────────────────────────────────────
    ssl_certificate     /etc/letsencrypt/live/example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/example.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 1d;
    ssl_stapling on;
    ssl_stapling_verify on;

    # ── Limits (Slowloris and body-size defence) ─────────────────────────────
    client_max_body_size  12m;
    client_body_timeout   10s;
    client_header_timeout 10s;
    send_timeout          10s;
    keepalive_timeout     30s;

    limit_req  zone=general burst=50 nodelay;
    limit_conn conns 20;
    limit_req_status 429;

    # ── Compression ──────────────────────────────────────────────────────────
    gzip on;
    gzip_vary on;
    gzip_comp_level 6;
    gzip_min_length 256;
    gzip_types text/plain text/css application/json application/javascript
               text/xml application/xml image/svg+xml;

    brotli on;
    brotli_comp_level 6;
    brotli_types text/plain text/css application/json application/javascript
                 text/xml application/xml image/svg+xml;

    # ── Routing ──────────────────────────────────────────────────────────────
    location / {
        try_files $uri $uri/ /index.php?$query_string;
    }

    location = /favicon.ico { access_log off; log_not_found off; }
    location = /robots.txt  { access_log off; log_not_found off; }

    location ~ ^/(login|register|password) {
        limit_req zone=login burst=3 nodelay;
        try_files $uri /index.php?$query_string;
    }

    location ~ \.php$ {
        fastcgi_pass unix:/run/php/php8.4-fpm.sock;
        fastcgi_index index.php;
        fastcgi_param SCRIPT_FILENAME $realpath_root$fastcgi_script_name;
        fastcgi_param DOCUMENT_ROOT   $realpath_root;
        include fastcgi_params;

        fastcgi_hide_header X-Powered-By;
        fastcgi_read_timeout 60s;
        fastcgi_buffers 16 16k;
        fastcgi_buffer_size 32k;
    }

    # ── Private file delivery (authorization in PHP, transfer by Nginx) ───────
    location /protected/ {
        internal;                       # unreachable except via X-Accel-Redirect
        alias /var/www/app/shared/storage/app/private/;
    }

    # ── Static assets ────────────────────────────────────────────────────────
    location ~* \.(?:css|js|jpg|jpeg|png|gif|webp|avif|svg|woff2?|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
        access_log off;
        try_files $uri =404;
    }

    # ── Deny dotfiles, but allow ACME ────────────────────────────────────────
    location ~ /\.(?!well-known).* {
        deny all;
        access_log off;
        log_not_found off;
    }

    access_log /var/log/nginx/app-access.log;
    error_log  /var/log/nginx/app-error.log warn;
}
```

The `internal` directive on `/protected/` is what makes `X-Accel-Redirect` safe — the path
cannot be requested directly, only served by Nginx acting on the header your authorized
controller sets. See `laravel-media-management`.

### Behind a CDN

```nginx
# Only accept traffic from the CDN, or the origin IP bypasses every protection
allow 173.245.48.0/20;
# ... full published range ...
deny all;

# Restore the real client IP, or every request appears to come from the CDN
# and application rate limiting blocks everyone or nobody.
set_real_ip_from 173.245.48.0/20;
real_ip_header CF-Connecting-IP;
```

## Apache

Common on shared hosting (Hostinger, cPanel).

```apache
<VirtualHost *:443>
    ServerName example.com
    DocumentRoot /var/www/app/current/public

    <Directory /var/www/app/current/public>
        Options -Indexes +FollowSymLinks
        AllowOverride All
        Require all granted
    </Directory>

    <FilesMatch "\.php$">
        SetHandler "proxy:unix:/run/php/php8.4-fpm.sock|fcgi://localhost"
    </FilesMatch>

    Header always set X-Content-Type-Options "nosniff"
    Header always set X-Frame-Options "DENY"
    Header always unset X-Powered-By

    <FilesMatch "^\.">
        Require all denied
    </FilesMatch>

    SSLEngine on
    SSLCertificateFile    /etc/letsencrypt/live/example.com/fullchain.pem
    SSLCertificateKeyFile /etc/letsencrypt/live/example.com/privkey.pem
    SSLProtocol -all +TLSv1.2 +TLSv1.3
</VirtualHost>
```

Laravel ships `public/.htaccess` with the rewrite rules. `AllowOverride All` is required
for it to take effect.

## PHP-FPM

```ini
; /etc/php/8.4/fpm/pool.d/app.conf
[app]
user = www-data
group = www-data
listen = /run/php/php8.4-fpm.sock
listen.owner = www-data
listen.group = www-data

pm = dynamic
pm.max_children = 40
pm.start_servers = 10
pm.min_spare_servers = 5
pm.max_spare_servers = 15
pm.max_requests = 500              ; recycle to bound leaks

pm.status_path = /fpm-status       ; restrict to localhost in nginx
request_terminate_timeout = 60s
request_slowlog_timeout = 10s
slowlog = /var/log/php8.4-fpm-slow.log

php_admin_value[error_log] = /var/log/php8.4-fpm-error.log
php_admin_flag[log_errors] = on
```

### Sizing `pm.max_children`

```bash
ps --no-headers -o rss -C php-fpm8.4 | awk '{sum+=$1; n++} END {print sum/n/1024 " MB avg"}'
```

```
max_children = (RAM available for PHP) / (average process MB)
```

Example: 4GB free, 60MB average → ~66. Round down and leave headroom for MySQL and Redis.

Setting it too high causes swapping, which is far worse than queuing. Too low causes 502s
under load. Watch `listen queue` in the FPM status page.

### php.ini

```ini
expose_php = Off
display_errors = Off
log_errors = On

memory_limit = 256M
max_execution_time = 30
post_max_size = 12M
upload_max_filesize = 10M
max_input_vars = 1000              ; without this, a 500k-field POST is a cheap DoS

date.timezone = UTC
session.cookie_httponly = 1
session.cookie_secure = 1
session.use_strict_mode = 1

; OPcache — the biggest single PHP performance setting
opcache.enable = 1
opcache.memory_consumption = 256
opcache.interned_strings_buffer = 16
opcache.max_accelerated_files = 20000
opcache.validate_timestamps = 0    ; production only — reload FPM on deploy
opcache.save_comments = 1          ; required: annotations/attributes need them
```

`opcache.save_comments=0` breaks any package using doc-comment annotations. Leave it on.

## MySQL

```ini
# /etc/mysql/conf.d/app.cnf
[mysqld]
# The single most important setting: the working set should fit here
innodb_buffer_pool_size = 4G          # ~70% of RAM on a dedicated DB server
innodb_buffer_pool_instances = 4
innodb_log_file_size = 1G
innodb_flush_log_at_trx_commit = 1    # 2 is faster, risks ~1s of transactions
innodb_flush_method = O_DIRECT
innodb_file_per_table = 1

max_connections = 200                  # must exceed (fpm children + queue workers)
thread_cache_size = 50

slow_query_log = 1
slow_query_log_file = /var/log/mysql/slow.log
long_query_time = 0.5
log_queries_not_using_indexes = 1

character-set-server = utf8mb4
collation-server = utf8mb4_unicode_ci
```

```sql
-- Buffer pool hit rate: target > 99%
SHOW ENGINE INNODB STATUS\G
```

Connection budget:

```
max_connections ≥ (php-fpm max_children) + (queue workers) + (scheduler) + headroom
```

Exceeding it produces 500s under load. A connection pooler (ProxySQL, PgBouncer) helps once
worker counts get high.

## Redis

```conf
# /etc/redis/redis.conf
bind 127.0.0.1 ::1
protected-mode yes
requirepass <strong-password>

maxmemory 1gb

# volatile-lru, NOT allkeys-lru, when this Redis holds queue data.
# allkeys-lru will silently evict queued jobs under memory pressure.
maxmemory-policy volatile-lru

appendonly yes
appendfsync everysec

# Disable commands that can take the instance down or wipe data
rename-command FLUSHALL ""
rename-command FLUSHDB ""
rename-command KEYS ""
rename-command CONFIG ""
```

Separate databases so a cache flush does not drop queued jobs:

```php
// config/database.php
'redis' => [
    'default' => ['database' => 0],   // queue
    'cache'   => ['database' => 1],
    'session' => ['database' => 2],
],
```

## Supervisor

```ini
; /etc/supervisor/conf.d/laravel-worker.conf
[program:laravel-worker]
process_name=%(program_name)s_%(process_num)02d
command=php /var/www/app/current/artisan queue:work redis --queue=high,default --sleep=3 --tries=3 --max-time=3600
directory=/var/www/app/current
autostart=true
autorestart=true
stopasgroup=true
killasgroup=true
user=www-data
numprocs=4
redirect_stderr=true
stdout_logfile=/var/log/supervisor/worker.log
stdout_logfile_maxbytes=10MB
stopwaitsecs=3600
```

```ini
[program:laravel-horizon]
command=php /var/www/app/current/artisan horizon
autostart=true
autorestart=true
user=www-data
numprocs=1
stopwaitsecs=3600
```

```bash
sudo supervisorctl reread && sudo supervisorctl update
sudo supervisorctl status
```

**`stopwaitsecs` must exceed the longest job timeout**, or Supervisor kills a worker
mid-job during a restart. And `--max-time=3600` recycles workers hourly to bound memory
growth.

Horizon and manual `queue:work` are alternatives, not complements — do not run both on the
same queues.

## Cron

```cron
* * * * * cd /var/www/app/current && php artisan schedule:run >> /dev/null 2>&1
```

**Exactly one entry.** Everything else is defined in `routes/console.php`. Adding a cron
entry per command is the mistake that causes duplicate runs and jobs that fire while the
app is mid-deploy.

On multiple servers, only one should run the scheduler — or use
`->onOneServer()` with a shared cache:

```php
Schedule::command('reports:generate')->daily()->onOneServer()->withoutOverlapping();
```

## Firewall

```bash
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
ufw allow 80,443/tcp
ufw enable

# MySQL and Redis must NEVER be world-reachable
ufw deny 3306
ufw deny 6379
```

```bash
# Brute-force protection at the SSH layer
apt install fail2ban
```

SSH: key-only, no root login, non-default port if you like (security through obscurity is
not security, but it does cut log noise).

## TLS

```bash
certbot --nginx -d example.com -d www.example.com
systemctl status certbot.timer          # verify auto-renewal is armed
certbot renew --dry-run
```

Alert on certificate expiry under 14 days. Auto-renewal failing silently is a common and
entirely avoidable outage.

## Log rotation

```
# /etc/logrotate.d/laravel
/var/www/app/shared/storage/logs/*.log {
    daily
    rotate 14
    compress
    delaycompress
    missingok
    notifempty
    create 0640 www-data www-data
}
```

```php
// config/logging.php
'daily' => [
    'driver' => 'daily',
    'path'   => storage_path('logs/laravel.log'),
    'level'  => env('LOG_LEVEL', 'warning'),
    'days'   => 14,
],
```

`LOG_LEVEL=debug` in production fills the disk within days. `warning` is the right default.
