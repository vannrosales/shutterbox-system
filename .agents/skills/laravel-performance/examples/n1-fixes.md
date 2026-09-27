# Six real N+1s and their fixes

Query counts measured with 50 rows on the page.

---

## 1. The dashboard that issued 203 queries

```php
// ✗ Controller
public function index()
{
    $orders = Order::latest()->take(50)->get();
    return view('orders.index', compact('orders'));
}
```

```blade
@foreach ($orders as $order)
    <tr>
        <td>{{ $order->customer->name }}</td>          {{-- +50 --}}
        <td>{{ $order->items->count() }}</td>          {{-- +50, hydrates all items --}}
        <td>{{ $order->payments->sum('amount') }}</td> {{-- +50 --}}
        <td>{{ $order->latestNote?->body }}</td>       {{-- +50 --}}
    </tr>
@endforeach
```

**203 queries.**

```php
// ✓
public function index()
{
    $orders = Order::query()
        ->select(['id', 'customer_id', 'reference', 'status', 'created_at'])
        ->with('customer:id,name')
        ->withCount('items')
        ->withSum('payments', 'amount')
        ->addSelect(['latest_note' => Note::select('body')
            ->whereColumn('order_id', 'orders.id')
            ->latest()
            ->limit(1),
        ])
        ->latest()
        ->take(50)
        ->get();

    return view('orders.index', compact('orders'));
}
```

```blade
<td>{{ $order->customer->name }}</td>
<td>{{ $order->items_count }}</td>
<td>{{ Number::currency($order->payments_sum_amount ?? 0, 'PHP') }}</td>
<td>{{ $order->latest_note }}</td>
```

**2 queries.** The subquery-select for "latest related row" avoids both the N+1 and the
row-duplication a JOIN would cause.

---

## 2. The API resource that scaled with `?include`

```php
// ✗ 151 queries for 50 posts
public function toArray(Request $request): array
{
    return [
        'id'       => $this->id,
        'title'    => $this->title,
        'author'   => new UserResource($this->author),
        'tags'     => TagResource::collection($this->tags),
        'comments' => $this->comments->count(),
    ];
}
```

```php
// ✓ 1–4 queries depending on what the client asked for
public function toArray(Request $request): array
{
    return [
        'id'             => $this->id,
        'title'          => $this->title,
        'author'         => UserResource::make($this->whenLoaded('author')),
        'tags'           => TagResource::collection($this->whenLoaded('tags')),
        'comments_count' => $this->whenCounted('comments'),
    ];
}
```

```php
// Controller — the client controls the cost, within a whitelist
public function index(Request $request): AnonymousResourceCollection
{
    $allowed = ['author', 'tags'];
    $includes = array_intersect(
        explode(',', (string) $request->query('include')),
        $allowed,
    );

    return PostResource::collection(
        Post::with($includes)->withCount('comments')->paginate(20)
    );
}
```

`whenLoaded()` / `whenCounted()` omit the key entirely when absent, so a client that does
not ask for authors does not pay for them. Whitelisting `include` prevents
`?include=comments.author.posts.comments` from being a denial-of-service vector.
See `laravel-api-standards`.

---

## 3. The policy check inside the loop

```blade
{{-- ✗ 51 queries: one per @can --}}
@foreach ($documents as $document)
    <li>
        {{ $document->title }}
        @can('update', $document)
            <a href="{{ route('documents.edit', $document) }}">{{ __('Edit') }}</a>
        @endcan
    </li>
@endforeach
```

```php
// The policy was querying per call
public function update(User $user, Document $document): bool
{
    return $user->roles()->whereHas('permissions', fn ($q) =>
        $q->where('name', 'documents.update')
    )->exists();
}
```

```php
// ✓ Load the permission set once
public function index()
{
    $documents = Document::with('owner:id,name')->paginate(50);

    auth()->user()->loadMissing('roles.permissions');

    return view('documents.index', compact('documents'));
}

// Policy now reads from memory
public function update(User $user, Document $document): bool
{
    return $user->hasPermissionTo('documents.update')
        && $user->tenant_id === $document->tenant_id;
}
```

**3 queries.** Alternatively, precompute the abilities once and pass them to the view. If
you use `spatie/laravel-permission`, its permission cache handles this — but only if you
call the cached methods (`hasPermissionTo`) rather than querying the relation.

---

## 4. The accessor that looked free

```php
// ✗ Every access is a query — invisible at the call site
protected function unreadCount(): Attribute
{
    return Attribute::get(fn (): int => $this->notifications()->whereNull('read_at')->count());
}
```

```blade
@foreach ($users as $user)
    <td>{{ $user->unread_count }}</td>   {{-- +50 queries --}}
@endforeach
```

```php
// ✓ Aggregate in the query
User::withCount([
    'notifications as unread_count' => fn ($q) => $q->whereNull('read_at'),
])->paginate(50);
```

Remove the accessor, or rename it so the cost is visible:

```php
// If it must stay, make the cost obvious and memoise per instance
public function fetchUnreadCount(): int
{
    return $this->unreadCountCache ??= $this->notifications()->whereNull('read_at')->count();
}
```

**Rule:** an accessor that queries is a trap. Property syntax implies a free read.

---

## 5. The polymorphic activity feed

```php
// ✗ 1 + N + N — one for the subject, one for each subject's own relation
$activities = Activity::latest()->take(50)->get();

foreach ($activities as $activity) {
    echo $activity->subject->title;
    echo $activity->subject->author->name;
}
```

```php
// ✓ 4 queries: activities, posts, comments, authors
$activities = Activity::query()
    ->with(['causer:id,name'])
    ->with(['subject' => fn (MorphTo $morphTo) => $morphTo->morphWith([
        Post::class    => ['author:id,name'],
        Comment::class => ['post:id,title'],
        Invoice::class => [],
    ])])
    ->latest()
    ->take(50)
    ->get();
```

`morphWith()` is the only way to eager load *through* a polymorphic relation. Without it,
`with('subject')` loads the subjects but each subject's own relations are still lazy.

---

## 6. The export that ran out of memory

```php
// ✗ 500k orders hydrated as Eloquent models → memory exhausted
public function export()
{
    $orders = Order::with('customer')->get();

    return Excel::download(new OrdersExport($orders), 'orders.xlsx');
}
```

```php
// ✓ Streamed, query builder, joined instead of eager loaded, constant memory
public function export(): StreamedResponse
{
    return response()->streamDownload(function (): void {
        $out = fopen('php://output', 'wb');
        fputcsv($out, ['Reference', 'Customer', 'Total', 'Placed at']);

        DB::table('orders')
            ->join('customers', 'customers.id', '=', 'orders.customer_id')
            ->select(['orders.id', 'orders.reference', 'customers.name', 'orders.total', 'orders.placed_at'])
            ->where('orders.tenant_id', auth()->user()->tenant_id)
            ->orderBy('orders.id')
            ->lazyById(5000, 'orders.id')
            ->each(fn (object $r) => fputcsv($out, [
                $r->reference, $r->name, $r->total / 100, $r->placed_at,
            ]));

        fclose($out);
    }, 'orders.csv', [
        'Content-Type' => 'text/csv; charset=UTF-8',
        'X-Accel-Buffering' => 'no',
    ]);
}
```

**Constant ~20MB** regardless of row count.

Three changes did it: query builder instead of Eloquent (no model hydration), `lazyById`
instead of `get`, and streaming output instead of building a file in memory. Above ~100k
rows, move this to a queued job and email a signed link — `references/large-datasets.md`.

---

## What they have in common

| Symptom | Root cause |
|---|---|
| Query count grows with rows | Relation accessed inside a loop |
| Looks fine in the controller | The N+1 is in the view, the resource, or the policy |
| Passed code review | Nobody counted queries |
| Fine in staging | Staging had 50 rows; production has 500,000 |

Two things prevent all six:

1. `Model::preventLazyLoading()` in development — makes the N+1 throw at the exact line.
2. A query-count assertion in the test — makes it stay fixed.
