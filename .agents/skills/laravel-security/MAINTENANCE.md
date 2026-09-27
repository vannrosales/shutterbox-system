# Maintaining `laravel-security`

Security guidance rots faster than any other kind. Review this skill on a schedule, not
only when something breaks.

## Review triggers

| Trigger | Action |
|---|---|
| OWASP Top 10 revision | Rewrite `references/owasp-laravel.md` mappings |
| Laravel security release | Check whether the guidance here changed; update version notes |
| A CVE affecting a package the library recommends | Update the recommendation |
| An incident in any project using the library | Add the specific check to `checklists/security-review.md` — every escaped vulnerability becomes a permanent gate |
| NPC circular or RA amendment | Update `references/data-privacy-ph.md` |
| Browser security feature ships or is deprecated | Update `references/headers-csp.md` |
| Password/MFA guidance changes (NIST SP 800-63) | Update `references/authentication.md` |

Scheduled: **every 3 months** — shorter than the other skills, deliberately. Plus
immediately on any Laravel security advisory.

## The parts most likely to be wrong

**1. `references/data-privacy-ph.md`** — carries a scope note stating it is not legal
advice. **Keep that note.** NPC circulars change; a confidently-stated obsolete requirement
is worse than a pointer to the authority. When updating, either cite a source with a date
or keep the hedge.

**2. Cryptography specifics** — Argon2 parameters, TLS version floors, and cipher
recommendations move. Do not invent numbers; take them from the current OWASP Cheat Sheet
or the framework defaults, and record where they came from.

**3. Header support** — CSP directives, `Permissions-Policy` feature names, and
`COOP`/`CORP` behaviour change with browser releases. Verify against MDN before adding a
directive.

**4. The grep patterns in `templates/security-workflow.yml`** — they produce false
positives as codebases evolve. When one appears, **narrow the pattern**; do not delete the
check. A deleted check is a silent regression.

## What to update where

| Change | File |
|---|---|
| New attack class or OWASP mapping | `references/owasp-laravel.md` |
| Password, MFA, session, token guidance | `references/authentication.md` |
| Policy, tenancy, IDOR, privilege escalation | `references/authorization.md` |
| Headers, CSP, CORS, cookies | `references/headers-csp.md` |
| Secrets, scanning, supply chain | `references/secrets-dependencies.md` |
| Rate limiting, WAF, load shedding | `references/abuse-resilience.md` |
| Philippine privacy law | `references/data-privacy-ph.md` |
| New blocking rule | `checklists/security-review.md` |
| Production readiness | `checklists/pre-launch-security.md` |
| CI enforcement | `templates/security-workflow.yml` |

## Honesty rules for this skill

Two claims in `SKILL.md` are deliberately hedged. Keep them hedged:

1. **DDoS.** Application rate limiting does not stop volumetric attacks. The layered model
   in `references/abuse-resilience.md` names what each layer actually does. Never let this
   collapse into "we have DDoS protection."
2. **Legal compliance.** This skill produces sound engineering controls. It does not
   certify compliance with RA 10173, PCI DSS, HIPAA, or anything else. Certification
   requires a qualified assessor.

If a future edit makes either claim stronger, that edit is wrong.

## Testing changes to this skill

1. Skill loads: `/laravel-security`
2. Prompt test — *"Add an endpoint that lets users download their invoice PDF"* — verify
   the output includes a policy check, a signed URL or authorizing controller, and does
   **not** put the file in `public/`
3. Second prompt test — *"Let users sort the orders table by any column"* — verify it
   whitelists rather than interpolating into `orderByRaw`
4. Third prompt test — *"How do we protect against DDoS?"* — verify the answer is the
   layered model, not "add throttle middleware"
5. Templates are valid:

```bash
php -l .claude/skills/laravel-security/templates/SecurityHeaders.php.stub
php -l .claude/skills/laravel-security/templates/AuditLog.php.stub
php -l .claude/skills/laravel-security/templates/rate-limiters.php
```

6. The CI workflow's grep patterns do not false-positive on a clean project:

```bash
grep -rn --include="*.php" "env(" app/ routes/ database/    # should be empty
```

## Boundary discipline

Owns: input handling, authz enforcement, output escaping, headers, secrets, session and
cookie configuration, abuse resistance, audit logging, dependency scanning, privacy
controls.

Hand off:
- Upload pipeline mechanics, derivatives, storage layout → `laravel-media-management`
- API token shape, scopes, error envelope → `laravel-api-standards`
- Server hardening, TLS termination, firewall, WAF deployment → `laravel-devops-deployment`
- `tenant_id` schema and index placement → `laravel-database-scale`
- Input caps as *performance* controls → `laravel-performance`
- Test structure → `laravel-testing-qa`

**Shared areas that must stay consistent:**

| Topic | This skill owns | Other skill owns |
|---|---|---|
| Multi-tenancy | Enforcement: global scopes, policies, 404-not-403, cross-tenant tests | Schema shape: `tenant_id` column, leading index position (`laravel-database-scale`) |
| Input caps | Abuse control framing | Performance framing (`laravel-performance`) — both say the same numbers |
| File uploads | Validation rules, storage location, serving authorization | Derivative generation, formats, CDN (`laravel-media-management`) |
| Rate limiting | Definitions and business-action limits | Nginx/proxy configuration (`laravel-devops-deployment`) |

If you change guidance in a shared area, change it in both places in the same commit.

## Adding a new check

When an incident produces a new rule:

1. Add the concrete fix to the relevant `references/` file
2. Add a checkbox to `checklists/security-review.md`
3. If it is mechanically detectable, add it to `templates/security-workflow.yml`
4. If it is common enough to be worth the attention cost, add one line to `SKILL.md`

Step 4 is the one to resist. `SKILL.md` is read on every activation; it should hold the
rules that prevent the most incidents, not every rule.

## Changelog

| Date | Change |
|---|---|
| 2026-07-31 | Initial version. OWASP Top 10 (2021) mapping, WCAG-compatible auth guidance, RA 10173 controls, layered abuse-resilience model. |
