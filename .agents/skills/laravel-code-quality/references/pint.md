# Laravel Pint

Pint wraps PHP-CS-Fixer with Laravel-aware presets. It ends every formatting discussion,
permanently.

## Setup

Pint ships with Laravel. Otherwise:

```bash
composer require --dev laravel/pint
```

```bash
vendor/bin/pint              # fix everything
vendor/bin/pint --test       # check only — the CI gate
vendor/bin/pint --dirty      # only files changed vs HEAD
vendor/bin/pint -v           # show which rules fired
vendor/bin/pint app/Actions  # scope to a path
```

## Configuration

```json
{
    "preset": "laravel",
    "rules": {
        "declare_strict_types": true,
        "final_class": false,
        "global_namespace_import": {
            "import_classes": true,
            "import_constants": false,
            "import_functions": false
        },
        "ordered_imports": {
            "sort_algorithm": "alpha",
            "imports_order": ["class", "function", "const"]
        },
        "no_unused_imports": true,
        "no_superfluous_phpdoc_tags": {
            "allow_mixed": true,
            "remove_inheritdoc": true
        },
        "trailing_comma_in_multiline": {
            "elements": ["arrays", "arguments", "parameters", "match"]
        },
        "concat_space": { "spacing": "none" },
        "method_argument_space": { "on_multiline": "ensure_fully_multiline" },
        "single_quote": true,
        "not_operator_with_successor_space": true
    },
    "exclude": ["bootstrap/cache", "storage"],
    "notPath": ["_ide_helper.php", "_ide_helper_models.php"]
}
```

### Presets

| Preset | Base |
|---|---|
| `laravel` | Laravel's own conventions. **Default.** |
| `psr12` | PSR-12 only |
| `per` | PER Coding Style (the PSR-12 successor) |
| `symfony` | Symfony conventions |
| `empty` | No rules — build your own |

The `laravel` preset already includes PSR-12. There is no reason to choose `psr12` in a
Laravel project.

### Rules worth adding

**`declare_strict_types`** — the highest-value addition. Adds
`declare(strict_types=1);` to every file, which turns silent type coercion into a
`TypeError`.

```php
// Without strict types: "5 apples" becomes 5. Silently.
function total(int $quantity): int { return $quantity * 2; }
total("5 apples");     // 10, no error
```

Enabling it on an existing codebase **will** surface real bugs. That is the point, but do
it in its own commit with the test suite green first.

**`no_superfluous_phpdoc_tags`** — removes `@param string $name` next to `string $name`.
Docblocks that restate the signature are noise that goes stale.

**`not_operator_with_successor_space`** — `! $user` rather than `!$user`. Laravel's own
codebase convention, and genuinely easier to spot in a long condition.

**`final_class: false`** — deliberately off. The library's convention is `final` on actions,
services, DTOs, and jobs, but not on models (which packages extend) or base classes. Apply
it by judgement, not automatically.

## Adopting Pint in an existing codebase

```bash
# 1. Make sure the suite is green FIRST
php artisan test

# 2. Format everything, in its own commit
vendor/bin/pint
git add -A && git commit -m "style: apply Pint formatting"

# 3. Confirm nothing broke
php artisan test

# 4. Now enable the CI gate
```

**Never mix a formatting sweep into a feature PR.** A 4,000-line diff where 3,990 lines are
whitespace is unreviewable, and the ten real lines get approved unseen.

If the repository has a long history, add the formatting commit to
`.git-blame-ignore-revs` so `git blame` still points at the author who wrote the logic:

```
# .git-blame-ignore-revs
a1b2c3d4e5f6789012345678901234567890abcd
```

```bash
git config blame.ignoreRevsFile .git-blame-ignore-revs
```

## Editor integration

**VS Code** — `.vscode/settings.json`:

```json
{
    "editor.formatOnSave": true,
    "[php]": { "editor.defaultFormatter": "open-southeners.laravel-pint" }
}
```

**PhpStorm** — Settings → PHP → Quality Tools → Laravel Pint, then enable "Run on save".

Format-on-save removes the pre-commit friction entirely: the file is already correct by the
time you commit.

## Pre-commit

```bash
#!/usr/bin/env bash
# .git/hooks/pre-commit
set -e

FILES=$(git diff --cached --name-only --diff-filter=ACM | grep '\.php$' || true)
[ -z "$FILES" ] && exit 0

vendor/bin/pint --test $FILES || {
    echo "Formatting issues. Run: composer fix"
    exit 1
}
```

Or fix automatically and re-stage:

```bash
vendor/bin/pint $FILES
git add $FILES
```

Auto-fixing is friendlier but means the committed content differs from what was staged —
some teams dislike that. Pick one and be consistent.

## CI

```yaml
- name: Pint
  run: vendor/bin/pint --test
```

Fail the build. A style check that warns is a style check that is ignored, and within a
month the codebase has two styles.

### Auto-fix on PRs

```yaml
- name: Fix style
  run: vendor/bin/pint

- uses: stefanzweifel/git-auto-commit-action@v5
  with:
    commit_message: "style: fix code style"
```

Convenient, but it pushes commits authored by a bot to contributor branches. Prefer failing
the build and letting the author run `composer fix` — the feedback loop teaches the tool.

## Rules that are debated, and the answer

| Question | Answer |
|---|---|
| Tabs or spaces? | Spaces, 4. PSR-12. Not negotiable. |
| Braces on the same line? | PSR-12: same line for control structures, next line for classes and methods. |
| Single or double quotes? | Single, unless interpolating. `single_quote` rule. |
| Trailing commas? | Yes, in multiline. Cleaner diffs. |
| Import order? | Alphabetical, classes then functions then constants. |
| Line length? | Pint does not enforce one. ~120 is a reasonable review guideline. |
| Yoda conditions? | No. `$x === null`, not `null === $x`. |
| `!$x` or `! $x`? | `! $x`. Laravel convention. |

Every one of these is settled by the config file. That is the entire value of the tool —
not that its choices are optimal, but that they are made once.

## When Pint and PHPStan disagree

They rarely conflict, but if they do, PHPStan wins — it is describing correctness, Pint is
describing appearance.

```json
{
    "rules": {
        "no_superfluous_phpdoc_tags": {
            "allow_mixed": true          // keep @param mixed $x that PHPStan needs
        }
    }
}
```

## What Pint does not do

- Rename things
- Restructure code
- Add types
- Remove dead code
- Enforce architecture

Those are Rector (`references/rector.md`) and PHPStan
(`references/phpstan.md`). Pint is formatting only, and keeping that boundary is what makes
it fast and safe to run on every save.
