# CI/CD

## Pipeline shape

```
push / PR
    ↓
┌─────────────────────────────────────────┐
│ Parallel: lint · static analysis · tests │   ← fast feedback, all must pass
│           · security · a11y              │
└─────────────────────────────────────────┘
    ↓ (main only)
  build assets + image
    ↓
  deploy staging  →  smoke tests
    ↓ (manual approval)
  deploy production → smoke tests → notify
```

Run the checks in parallel. A serial pipeline that takes 12 minutes gets bypassed; a
4-minute one does not.

## Full workflow

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true       # a new push supersedes the running build

permissions:
  contents: read

jobs:
  quality:
    name: Lint & static analysis
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: shivammathur/setup-php@v2
        with: { php-version: '8.4', coverage: none }

      - uses: actions/cache@v4
        with:
          path: ~/.composer/cache
          key: composer-${{ hashFiles('composer.lock') }}

      - run: composer install --no-interaction --prefer-dist --no-progress

      - name: Pint
        run: vendor/bin/pint --test

      - name: PHPStan
        run: vendor/bin/phpstan analyse --memory-limit=1G --no-progress

      - name: Rector (dry run)
        run: vendor/bin/rector process --dry-run

  tests:
    name: Tests (${{ matrix.db }})
    runs-on: ubuntu-latest
    strategy:
      fail-fast: false
      matrix:
        db: [sqlite, mysql]

    services:
      mysql:
        image: mysql:8.4
        env:
          MYSQL_DATABASE: testing
          MYSQL_ALLOW_EMPTY_PASSWORD: 'yes'
        ports: ['3306:3306']
        options: >-
          --health-cmd="mysqladmin ping" --health-interval=10s
          --health-timeout=5s --health-retries=5
      redis:
        image: redis:7-alpine
        ports: ['6379:6379']

    steps:
      - uses: actions/checkout@v4
      - uses: shivammathur/setup-php@v2
        with:
          php-version: '8.4'
          extensions: mbstring, pdo_mysql, intl, gd, redis, bcmath
          coverage: pcov

      - run: composer install --no-interaction --prefer-dist --no-progress
      - run: cp .env.example .env && php artisan key:generate

      - name: Run tests
        run: php artisan test --parallel --coverage --min=80
        env:
          DB_CONNECTION: ${{ matrix.db }}
          DB_HOST: 127.0.0.1
          DB_DATABASE: ${{ matrix.db == 'sqlite' && ':memory:' || 'testing' }}
          DB_USERNAME: root
          REDIS_HOST: 127.0.0.1

  security:
    name: Security
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }

      - uses: shivammathur/setup-php@v2
        with: { php-version: '8.4', coverage: none }

      - run: composer install --no-interaction --prefer-dist

      - name: Composer advisories
        run: composer audit --no-interaction

      - name: Secret scan
        uses: gitleaks/gitleaks-action@v2
        env: { GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }} }

      - name: env() outside config/
        run: |
          if grep -rn --include="*.php" "env(" app/ routes/ database/ 2>/dev/null; then
            echo "::error::env() must only be used in config/ — it returns null once config is cached"
            exit 1
          fi

  assets:
    name: Build assets
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '22', cache: npm }
      - run: npm ci
      - run: npm audit --audit-level=high
      - run: npm run build

      - name: Enforce bundle budget
        run: |
          JS=$(find public/build/assets -name '*.js' -exec gzip -c {} \; | wc -c)
          if [ "$JS" -gt 204800 ]; then
            echo "::error::JS bundle is ${JS} bytes gzipped, budget is 204800"
            exit 1
          fi

      - uses: actions/upload-artifact@v4
        with: { name: build, path: public/build }

  deploy-staging:
    needs: [quality, tests, security, assets]
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    environment:
      name: staging
      url: https://staging.example.com
    steps:
      - uses: actions/checkout@v4
      - uses: actions/download-artifact@v4
        with: { name: build, path: public/build }

      - name: Deploy
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.STAGING_HOST }}
          username: deploy
          key: ${{ secrets.DEPLOY_SSH_KEY }}
          script: cd /var/www/app && ./deploy.sh

      - name: Smoke test
        run: |
          curl -fsS https://staging.example.com/up
          curl -sI https://staging.example.com | grep -qi 'strict-transport-security'
          test "$(curl -s -o /dev/null -w '%{http_code}' https://staging.example.com/.env)" != "200"

  deploy-production:
    needs: [deploy-staging]
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    environment:
      name: production          # configure a required reviewer here
      url: https://example.com
    steps:
      - uses: actions/checkout@v4
      - uses: actions/download-artifact@v4
        with: { name: build, path: public/build }

      - name: Deploy
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.PRODUCTION_HOST }}
          username: deploy
          key: ${{ secrets.DEPLOY_SSH_KEY }}
          script: cd /var/www/app && ./deploy.sh

      - name: Smoke test
        run: |
          curl -fsS https://example.com/up
          curl -sI https://example.com | grep -qi 'strict-transport-security'

      - name: Notify
        if: always()
        uses: slackapi/slack-github-action@v1
        with:
          payload: |
            { "text": "Deploy ${{ job.status }}: ${{ github.sha }}" }
        env:
          SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK }}
```

## Environment protection

GitHub **Environments** give you the approval gate and scoped secrets:

- `staging` — deploys automatically from `main`
- `production` — requires a named reviewer, optionally a wait timer

Secrets are scoped per environment, so a staging deploy key cannot touch production.

## Secrets

| Store | Contents |
|---|---|
| GitHub Secrets | `DEPLOY_SSH_KEY`, host names, registry credentials |
| Server `shared/.env` | Application secrets |
| Secrets manager | Production credentials, rotated |

CI needs **deploy** credentials, not application secrets. A CI runner that can read the
production database password is a much larger blast radius than one that can only SSH as a
restricted deploy user.

Pin third-party actions to a commit SHA — a compromised action has full access to your CI
secrets:

```yaml
- uses: some/action@a1b2c3d4e5f6789...    # not @v3
```

## Caching

```yaml
- uses: actions/cache@v4
  with:
    path: ~/.composer/cache
    key: composer-${{ runner.os }}-${{ hashFiles('composer.lock') }}
    restore-keys: composer-${{ runner.os }}-

- uses: actions/setup-node@v4
  with:
    node-version: '22'
    cache: npm                    # handles the npm cache automatically
```

Cache keyed on the **lock file**, not on `package.json` — otherwise a resolved-version
change silently reuses a stale cache.

## Speed

| Technique | Saving |
|---|---|
| Parallel jobs | 60–70% wall clock |
| Dependency caching | 30–60s per job |
| `--parallel` tests | 4–6× on test time |
| `concurrency: cancel-in-progress` | Frees runners on rapid pushes |
| `--prefer-dist --no-progress` | 10–20s |
| Split slow suites to nightly | Keeps the PR loop under 5 minutes |

Target: **under 5 minutes** for the PR pipeline. Browser and accessibility suites go
nightly.

```yaml
# .github/workflows/nightly.yml
on:
  schedule: [{ cron: '0 2 * * *' }]
jobs:
  browser: ...        # Dusk
  a11y: ...           # pa11y-ci, Lighthouse
  security: ...       # composer audit — advisories land continuously
```

## Quality gates that should fail the build

| Gate | Rationale |
|---|---|
| Pint (`--test`) | Style drift is unreviewable diffs |
| PHPStan at the agreed level | Catches real type bugs |
| Tests, with a coverage floor | Prevents erosion |
| `composer audit` | Known advisories |
| Secret scan | A committed secret is a breach |
| `env()` outside `config/` | Silent nulls in production |
| Bundle-size budget | Performance regressions are invisible otherwise |
| OpenAPI spec is current | Docs that lie are worse than none |

Do **not** add gates that fail on things the team cannot act on immediately — a gate that
gets bypassed routinely trains everyone to bypass gates.

## Deploying migrations

```bash
php artisan migrate --force --isolated
```

`--isolated` takes an advisory lock so concurrent deploys across nodes do not race. Without
it, two nodes deploying simultaneously produce a partial migration.

For a destructive migration, gate it behind a manual approval step and take a verified
backup first (`references/backups-dr.md`).

## Rollback from CI

```yaml
name: Rollback

on:
  workflow_dispatch:
    inputs:
      release:
        description: 'Release timestamp (e.g. 20260731120000)'
        required: true

jobs:
  rollback:
    runs-on: ubuntu-latest
    environment: production
    steps:
      - uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.PRODUCTION_HOST }}
          username: deploy
          key: ${{ secrets.DEPLOY_SSH_KEY }}
          script: |
            ln -sfn /var/www/app/releases/${{ inputs.release }} /var/www/app/current
            sudo systemctl reload php8.4-fpm
            cd /var/www/app/current && php artisan queue:restart
```

Have this ready **before** you need it. Writing a rollback workflow during an incident is
how incidents get longer.

## Branch protection

- Require the status checks to pass
- Require at least one review
- Require branches to be up to date before merging
- Dismiss stale approvals on new commits
- No force-push to `main`
- Signed commits, if the project requires provenance
