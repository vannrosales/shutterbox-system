# Authorization

Authentication answers *who are you*. Authorization answers *may you do this to that*.
Broken authorization is the most common serious vulnerability in Laravel applications.

## Policies

Auto-discovered: `App\Models\Invoice` → `App\Policies\InvoicePolicy`.

```php
final class InvoicePolicy
{
    public function viewAny(User $user): bool
    {
        return $user->hasPermissionTo('invoices.view');
    }

    public function view(User $user, Invoice $invoice): Response
    {
        if (! $this->sameTenant($user, $invoice)) {
            return Response::denyAsNotFound();
        }

        return $user->hasPermissionTo('invoices.view')
            ? Response::allow()
            : Response::deny(__('You do not have permission to view invoices.'));
    }

    public function update(User $user, Invoice $invoice): Response
    {
        if (! $this->sameTenant($user, $invoice)) {
            return Response::denyAsNotFound();
        }

        if ($invoice->isLocked()) {
            return Response::deny(__('This invoice has been finalised and cannot be edited.'));
        }

        return $user->hasPermissionTo('invoices.update')
            ? Response::allow()
            : Response::deny(__('You do not have permission to edit invoices.'));
    }

    private function sameTenant(User $user, Invoice $invoice): bool
    {
        return $user->tenant_id === $invoice->tenant_id;
    }
}
```

### `deny()` vs `denyAsNotFound()`

| Situation | Response |
|---|---|
| Record belongs to another tenant | `denyAsNotFound()` → **404** |
| Record exists in your tenant, you lack the permission | `deny()` → **403** with a reason |
| Record exists, but its state forbids the action | `deny()` → **403** with a reason |

Returning 403 for another tenant's record confirms the record exists. With sequential IDs
that is a complete enumeration of the other tenant's data volume, and often of their
identifiers.

### `before()` — use with care

```php
public function before(User $user, string $ability): ?bool
{
    return $user->isSuperAdmin() ? true : null;    // null = continue to the specific method
}
```

`before()` returning `true` bypasses **every** check below it, including the tenant scope.
That is usually wrong even for super admins — a support engineer should not silently read
across tenants without it being logged. Prefer an explicit impersonation flow that is
audited.

## Gates — for non-model abilities

```php
// AppServiceProvider::boot()
Gate::define('access-admin-panel', fn (User $user) => $user->hasRole('admin'));
Gate::define('view-telescope', fn (User $user) => $user->isSuperAdmin());
Gate::define('export-data', fn (User $user) => $user->hasPermissionTo('data.export'));
```

```php
Gate::after(function (User $user, string $ability, ?bool $result): void {
    if ($result === false) {
        Log::channel('security')->info('Authorization denied', [
            'user'    => $user->id,
            'ability' => $ability,
            'ip'      => request()->ip(),
        ]);
    }
});
```

Logging denials is how you detect someone probing.

## Enforcement points

```php
// 1. Form Request — preferred; runs before the controller
public function authorize(): bool
{
    return $this->user()->can('update', $this->route('invoice'));
}

// 2. Controller
$this->authorize('update', $invoice);

// 3. Middleware
Route::put('/invoices/{invoice}', ...)->middleware('can:update,invoice');

// 4. Blade — UI only, NEVER the only check
@can('update', $invoice)
    <a href="{{ route('invoices.edit', $invoice) }}">{{ __('Edit') }}</a>
@endcan

// 5. Resource — for conditional fields
'can' => ['update' => $request->user()->can('update', $this->resource)],
```

**Hiding a button is not authorization.** The route must be protected independently.

## Model-level defence

```php
// Query-time: a scope the caller cannot forget
public function scopeVisibleTo(Builder $query, User $user): void
{
    $query->where('tenant_id', $user->tenant_id)
        ->when(! $user->hasPermissionTo('invoices.view-all'),
            fn ($q) => $q->where('created_by', $user->id));
}
```

```php
Invoice::visibleTo($request->user())->paginate(20);
```

For list endpoints this is essential — a policy checks one record; a list needs the filter
in the query.

## Multi-tenancy

```php
// Resolve once, per request
final class ResolveTenant
{
    public function handle(Request $request, Closure $next): Response
    {
        $tenant = $request->user()?->tenant;

        abort_if($tenant === null, 403);

        Context::add('tenant_id', $tenant->id);   // survives into queued jobs

        return $next($request);
    }
}
```

```php
// Global scope
abstract class TenantModel extends Model
{
    protected static function booted(): void
    {
        static::addGlobalScope(new TenantScope());

        static::creating(function (Model $model): void {
            $model->tenant_id ??= Context::get('tenant_id');
        });
    }
}
```

Three layers, all required:
1. **Schema** — `tenant_id` on every table, leading every index (`laravel-database-scale`)
2. **Query** — global scope so a forgotten filter is impossible
3. **Policy** — explicit check, returning 404 across tenants

Plus a **test**:

```php
it('returns 404 for another tenant\'s invoice', function (): void {
    $mine   = User::factory()->create();
    $theirs = Invoice::factory()->for(Tenant::factory())->create();

    actingAs($mine)->get(route('invoices.show', $theirs))->assertNotFound();
});
```

Write this test for every tenant-scoped resource. It is the single highest-value security
test in a multi-tenant application.

### Queue and console contexts

A global scope driven by request state does nothing in a queued job. Pass the tenant
explicitly:

```php
final class GenerateReport implements ShouldQueue
{
    public function __construct(public readonly int $tenantId) {}

    public function handle(): void
    {
        Context::add('tenant_id', $this->tenantId);
        // ...
    }
}
```

Laravel 12's `Context` propagates into jobs automatically when set during the request,
which handles the common case — but verify it rather than assume it for anything sensitive.

## Roles and permissions

`spatie/laravel-permission` is the usual choice.

```php
$user->assignRole('editor');
$user->givePermissionTo('invoices.update');
$user->hasPermissionTo('invoices.update');   // uses the permission cache
```

Design notes:
- **Check permissions, not roles**, in policies. `hasRole('admin')` scattered through the
  code makes adding a new role a code change; `hasPermissionTo('invoices.update')` makes it
  a data change.
- Permissions are per-tenant in a multi-tenant app — configure `teams` support.
- Cache invalidation on role change: the package handles it, but confirm after any custom
  write path.
- Eager load for list pages: `$user->loadMissing('roles.permissions')` — otherwise the
  policy N+1s (see `laravel-performance`).

## Privilege escalation

```php
// ✗ A user can assign themselves any role
'role' => ['required', 'string'],

// ✓ Whitelist, excluding privileged values
'role' => ['required', Rule::enum(Role::class)->except([Role::SuperAdmin, Role::Owner])],
```

```php
// ✓ And check the actor may grant it
public function assignRole(User $actor, User $target, Role $role): Response
{
    if ($role->level() >= $actor->role->level()) {
        return Response::deny(__('You cannot grant a role equal to or above your own.'));
    }

    return Response::allow();
}
```

Also guard:
- Users editing their own `tenant_id`
- Users editing their own `role` / `is_admin`
- Invitation flows that let the invitee choose their role
- API endpoints that accept a `user_id` and act on behalf of it

## Impersonation, done safely

```php
public function impersonate(User $target): RedirectResponse
{
    $this->authorize('impersonate', $target);

    session()->put('impersonator_id', auth()->id());

    AuditLog::record('user.impersonated', subject: $target, causer: auth()->user());

    Auth::login($target);

    return to_route('dashboard');
}
```

Requirements: audited, visibly indicated in the UI at all times, cannot impersonate an
equal-or-higher role, time-limited, and cannot perform destructive actions while
impersonating.

## Testing authorization

```php
it('forbids editing another user\'s invoice', function (): void {
    $other = Invoice::factory()->create();

    actingAs(User::factory()->create())
        ->putJson(route('invoices.update', $other), ['notes' => 'x'])
        ->assertNotFound();          // 404, not 403 — no existence disclosure
});

it('forbids a viewer from updating', function (): void {
    $user    = User::factory()->create();
    $invoice = Invoice::factory()->for($user->tenant)->create();
    $user->givePermissionTo('invoices.view');

    actingAs($user)->putJson(route('invoices.update', $invoice), [])->assertForbidden();
});

it('prevents assigning a super-admin role', function (): void {
    actingAs($admin)
        ->postJson(route('users.store'), ['name' => 'x', 'email' => 'a@b.c', 'role' => 'super_admin'])
        ->assertUnprocessable();
});
```

Negative tests are the ones that matter. A test suite that only proves the happy path works
proves nothing about security.

## Audit

```bash
php artisan route:list --except-vendor
```

Every route needs a deliberate middleware stack. Scan for:
- Routes with no `auth`
- Routes with `auth` but no policy check in the controller
- Admin routes not behind an admin gate
- API routes without `throttle`

```bash
# Controllers that take a model but never authorize
grep -rLn "authorize\|can(" app/Http/Controllers --include="*.php"
```
