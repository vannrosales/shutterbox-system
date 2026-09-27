# Antigravity Engineering Standards — Shutterbox System

This project follows the **Laravel Enterprise Skill Library** (Laravel 12 / PHP 8.4 + React 19 / TypeScript).

## Skill Routing & Workflow

- Load `laravel-ai-coding-standards` before any code change; it routes to the specialized domain skills.
- Non-negotiable gates before merge: `laravel-code-quality` checklist and `laravel-security` checklist.
- Public-facing UI additionally requires `laravel-ui-accessibility` and `laravel-responsive-design` sign-off.

## The 12 Skills Overview

1. `laravel-enterprise-architecture`: Layering, architecture patterns, DI, PSR standards.
2. `laravel-ui-accessibility`: WCAG 2.2 AA, semantics, keyboard navigation, ARIA.
3. `laravel-responsive-design`: Mobile-first layout, breakpoints, touch targets.
4. `laravel-performance`: N+1 prevention, caching, queues, asset pipeline.
5. `laravel-database-scale`: Schema, indexes, partitioning, growth planning.
6. `laravel-security`: OWASP defence, authz, headers, secrets, abuse resistance.
7. `laravel-media-management`: Upload validation, derivatives, storage layout, CDN.
8. `laravel-api-standards`: REST shape, versioning, errors, OpenAPI, Sanctum/Fortify.
9. `laravel-testing-qa`: Pest/PHPUnit, factories, a11y + security regression tests.
10. `laravel-devops-deployment`: Docker, Nginx, Horizon, CI/CD, backups, DR.
11. `laravel-code-quality`: Pint, PHPStan/Larastan, Rector, dead/duplicate code.
12. `laravel-ai-coding-standards`: Metaskill guiding AI modifications and planning.
