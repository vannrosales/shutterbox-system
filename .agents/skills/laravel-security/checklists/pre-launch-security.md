# Pre-launch security readiness

Complete before the first production release. Re-run before any launch that materially
changes exposure.

## 1. Configuration

- [ ] `APP_DEBUG=false`
- [ ] `APP_ENV=production`
- [ ] `APP_KEY` set, unique to this environment, not in the repository
- [ ] `SESSION_SECURE_COOKIE=true`
- [ ] `SESSION_DRIVER=redis` (or `database`) — not `file` behind a load balancer
- [ ] `SESSION_ENCRYPT=true`
- [ ] `composer install --no-dev --optimize-autoloader` in the deploy
- [ ] Telescope / Debugbar / Ignition **not installed** in production

```bash
composer show --installed | grep -iE 'telescope|debugbar|ignition|faker'
```

Must return nothing.

## 2. Exposure check

```bash
for p in .env .git/config composer.json phpunit.xml storage/logs/laravel.log \
         telescope horizon _ignition/health-check; do
  echo -n "$p → "; curl -s -o /dev/null -w "%{http_code}\n" "https://example.com/$p"
done
```

- [ ] All return 403 or 404
- [ ] Web root is `public/`, not the project root
- [ ] Directory listing disabled
- [ ] `X-Powered-By` and server version headers suppressed
- [ ] Horizon and any admin dashboard behind an authorization gate

## 3. Transport

- [ ] HTTPS enforced; HTTP redirects to HTTPS
- [ ] Valid certificate with auto-renewal configured and tested
- [ ] HSTS enabled (start with a short `max-age`, then raise)
- [ ] TLS 1.2 minimum; 1.3 preferred
- [ ] `URL::forceScheme('https')` in production
- [ ] Proxy headers trusted correctly, and only from the real proxy

## 4. Headers

```bash
curl -sI https://example.com | grep -iE 'content-security|strict-transport|x-frame|x-content|referrer|permissions'
```

- [ ] `Content-Security-Policy` present, without `unsafe-inline` in `script-src`
- [ ] CSP nonce is unique per request
- [ ] `Strict-Transport-Security`
- [ ] `X-Content-Type-Options: nosniff`
- [ ] `X-Frame-Options: DENY` and CSP `frame-ancestors 'none'`
- [ ] `Referrer-Policy: strict-origin-when-cross-origin`
- [ ] `Permissions-Policy` restricting unused features
- [ ] Authenticated responses are `Cache-Control: no-store, private`
- [ ] CORS `allowed_origins` is explicit, not `*`

## 5. Authentication

- [ ] Login rate limited by email+IP and by IP
- [ ] Registration and password reset rate limited
- [ ] Generic error messages — no user enumeration on login, registration, or reset
- [ ] Password policy: 12+ characters, `uncompromised()`
- [ ] MFA available, and **required** for admin roles
- [ ] Session lifetime appropriate to the risk
- [ ] Password confirmation required for sensitive actions
- [ ] Sanctum tokens have expiry; `sanctum:prune-expired` scheduled

## 6. Authorization

- [ ] Every model has a policy, or a documented reason it does not
- [ ] Cross-tenant access returns 404 — verified by a test, not by inspection
- [ ] `php artisan route:list --except-vendor` fully reviewed
- [ ] Admin routes behind an admin gate
- [ ] Every API route has `throttle`
- [ ] No route unintentionally public

## 7. Data protection

- [ ] Sensitive columns encrypted at rest
- [ ] Personal data inventory written down
- [ ] Retention periods set per category, with prune jobs **scheduled and verified running**
- [ ] Data export path built and tested
- [ ] Anonymisation path built, covering search index, cache, and third parties
- [ ] Privacy notice published and versioned
- [ ] DPO appointed; NPC registration considered (RA 10173)

## 8. Uploads

- [ ] Stored outside the web root
- [ ] Content-type validated by sniffing, not extension
- [ ] Filenames generated
- [ ] Size limits at every layer (validation, PHP, web server)
- [ ] Served through authorization or signed URLs
- [ ] Upload directory cannot execute scripts
- [ ] Malware scanning considered for user-to-user file sharing

## 9. Secrets

- [ ] No secrets in the repository or its history

```bash
gitleaks detect --source . --verbose
git log --all --full-history --oneline -- .env
```

- [ ] Production secrets in a manager, not a file
- [ ] Different secrets per environment
- [ ] Rotation procedure documented for each secret
- [ ] Anything ever exposed has been rotated
- [ ] `.env` file permissions restricted (`chmod 600`)

## 10. Dependencies

- [ ] `composer audit` clean
- [ ] `npm audit --audit-level=high` clean
- [ ] Automated dependency PRs configured
- [ ] GitHub Actions pinned to commit SHAs
- [ ] Lock files committed

## 11. Abuse resilience

- [ ] CDN/WAF in front of the origin
- [ ] Origin locked down to accept traffic only from the CDN
- [ ] Real client IP restored (`set_real_ip_from` / `real_ip_header`)
- [ ] Nginx `limit_req`, `limit_conn`, and body/header timeouts configured
- [ ] Application rate limits on all sensitive endpoints
- [ ] Business-action limits (resets, refunds, invitations)
- [ ] Input caps at the infrastructure level (`max_input_vars`, `post_max_size`)
- [ ] Load-shedding behaviour defined for queue saturation
- [ ] Incident runbook written and stored in the repository

## 12. Monitoring and response

- [ ] Security log channel configured with adequate retention
- [ ] Audit logging on authentication, authorization denials, privilege changes, exports,
      deletions, payments
- [ ] Error tracking with PII scrubbing
- [ ] Alerts configured: failed-login spikes, authz-denial spikes, 429 spikes, new admin
      created, bulk export
- [ ] Someone receives those alerts and knows what to do
- [ ] Breach response runbook, with the DPO's contact details
- [ ] Backups tested by performing an actual restore

## 13. Verification

- [ ] Full `checklists/security-review.md` pass on the codebase
- [ ] Automated security CI green
- [ ] Static analysis at the agreed level
- [ ] Psalm taint analysis run at least once
- [ ] External scan (securityheaders.com / Mozilla Observatory)
- [ ] Penetration test for systems handling money, health data, or government services
- [ ] Findings triaged, with owners and dates

## Sign-off

- [ ] All blocking findings resolved
- [ ] Accepted risks documented with a named owner and a review date
- [ ] Rollback plan tested

Signed: _______________  Role: _______________  Date: _______________
