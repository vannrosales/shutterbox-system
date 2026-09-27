# Responsive tables

Tables are the hardest responsive problem because the data genuinely is two-dimensional.
There is no strategy that is always right — pick by column count and user task.

## Decision guide

| Columns | User task | Strategy |
|---|---|---|
| ≤ 4 | Scan and act on individual rows | **Card stack** below `md` |
| 5–8 | Compare values across rows | **Scroll container** with a sticky first column |
| 9+ | Analysis | **Column priority** (hide low-priority) + row detail view |
| Any | Mostly one value per row | Reconsider — it may be a list, not a table |

---

## Strategy 1 — scroll container (default, safest)

Preserves the table structure and all semantics. The container must be keyboard-operable,
or it fails WCAG 2.1.1.

```blade
<div class="table-scroll" tabindex="0" role="region" aria-labelledby="invoices-caption">
    <table>
        <caption id="invoices-caption">{{ __('Invoices') }}</caption>
        <thead>
            <tr>
                <th scope="col">{{ __('Number') }}</th>
                <th scope="col">{{ __('Customer') }}</th>
                <th scope="col" class="numeric">{{ __('Amount') }}</th>
                <th scope="col">{{ __('Due') }}</th>
                <th scope="col">{{ __('Status') }}</th>
            </tr>
        </thead>
        <tbody>
            @foreach ($invoices as $invoice)
                <tr>
                    <th scope="row">{{ $invoice->number }}</th>
                    <td>{{ $invoice->customer->name }}</td>
                    <td class="numeric">{{ Number::currency($invoice->total, 'PHP') }}</td>
                    <td>{{ $invoice->due_at->isoFormat('LL') }}</td>
                    <td>{{ $invoice->status->label() }}</td>
                </tr>
            @endforeach
        </tbody>
    </table>
</div>
```

```css
.table-scroll {
    overflow-x: auto;
    overscroll-behavior-x: contain;
    -webkit-overflow-scrolling: touch;

    /* Shadow hints that there is more to the right */
    background:
        linear-gradient(to right, canvas 30%, transparent),
        linear-gradient(to left,  canvas 30%, transparent) right,
        linear-gradient(to right, rgb(0 0 0 / 0.15), transparent),
        linear-gradient(to left,  rgb(0 0 0 / 0.15), transparent) right;
    background-repeat: no-repeat;
    background-size: 3rem 100%, 3rem 100%, 1rem 100%, 1rem 100%;
    background-attachment: local, local, scroll, scroll;
}

.table-scroll:focus-visible {
    outline: 3px solid var(--focus-color);
    outline-offset: 2px;
}

.table-scroll table { min-inline-size: 40rem; }  /* force scroll rather than squash */

/* Sticky first column for orientation while scrolling */
.table-scroll th[scope="row"] {
    position: sticky;
    inset-inline-start: 0;
    background: canvas;      /* required — otherwise rows show through */
    z-index: 1;
}

.numeric { text-align: end; font-variant-numeric: tabular-nums; }
```

Required for accessibility:
- `tabindex="0"` — keyboard users must be able to scroll it
- `role="region"` + `aria-labelledby` — gives the scrollable area a name
- The scroll shadow — otherwise users do not know content is hidden

---

## Strategy 2 — card stack

Each row becomes a card below the breakpoint. Best for ≤4 columns with a clear primary
identifier.

```blade
<table class="table-cards">
    <caption>{{ __('Invoices') }}</caption>
    <thead>
        <tr>
            <th scope="col">{{ __('Number') }}</th>
            <th scope="col">{{ __('Customer') }}</th>
            <th scope="col">{{ __('Amount') }}</th>
            <th scope="col">{{ __('Status') }}</th>
        </tr>
    </thead>
    <tbody>
        @foreach ($invoices as $invoice)
            <tr>
                <th scope="row" data-label="{{ __('Number') }}">{{ $invoice->number }}</th>
                <td data-label="{{ __('Customer') }}">{{ $invoice->customer->name }}</td>
                <td data-label="{{ __('Amount') }}">{{ Number::currency($invoice->total, 'PHP') }}</td>
                <td data-label="{{ __('Status') }}">{{ $invoice->status->label() }}</td>
            </tr>
        @endforeach
    </tbody>
</table>
```

```css
@media (max-width: 47.99rem) {
    .table-cards thead {
        /* Visually hidden, still in the accessibility tree */
        position: absolute;
        inline-size: 1px; block-size: 1px;
        overflow: hidden; clip-path: inset(50%);
        white-space: nowrap;
    }

    .table-cards,
    .table-cards tbody,
    .table-cards tr,
    .table-cards th,
    .table-cards td {
        display: block;
    }

    .table-cards tr {
        border: 1px solid var(--border-color, #d1d5db);
        border-radius: 0.5rem;
        padding: 1rem;
        margin-block-end: 1rem;
    }

    .table-cards td,
    .table-cards th[scope="row"] {
        display: grid;
        grid-template-columns: minmax(6rem, 40%) 1fr;
        gap: 0.5rem;
        padding-block: 0.375rem;
        text-align: start;
    }

    .table-cards td::before,
    .table-cards th[scope="row"]::before {
        content: attr(data-label);
        font-weight: 600;
        color: var(--muted, #4b5563);
    }
}
```

**The accessibility cost, stated honestly:** `display: block` on table elements removes the
table semantics in most browsers — a screen reader no longer announces it as a table with
rows and columns. That is an acceptable trade *because* each cell now carries its own
visible label via `data-label`, so the relationship is still conveyed. Do not use
`display: block` tables **and** omit the labels.

`clip-path` on `thead` rather than `display: none` keeps the headers in the accessibility
tree where the browser preserves table semantics.

---

## Strategy 3 — column priority

For wide tables. Hide low-priority columns progressively; keep a way to see everything.

```blade
<th scope="col" data-priority="1">{{ __('Number') }}</th>
<th scope="col" data-priority="1">{{ __('Customer') }}</th>
<th scope="col" data-priority="2">{{ __('Amount') }}</th>
<th scope="col" data-priority="3">{{ __('Created') }}</th>
<th scope="col" data-priority="3">{{ __('Reference') }}</th>
```

```css
[data-priority="3"] { display: none; }
[data-priority="2"] { display: none; }

@media (min-width: 48rem) { [data-priority="2"] { display: table-cell; } }
@media (min-width: 62rem) { [data-priority="3"] { display: table-cell; } }
```

**Requirement:** hidden data must remain reachable. Provide a row detail page or an
expandable row — hiding a column with no alternative is data loss, not responsiveness.

```blade
<tr>
    ...
    <td>
        <a href="{{ route('invoices.show', $invoice) }}">
            {{ __('View') }}<span class="sr-only"> {{ __('full details for invoice :n', ['n' => $invoice->number]) }}</span>
        </a>
    </td>
</tr>
```

---

## Strategy 4 — expandable rows

```blade
<tbody>
    <tr>
        <th scope="row">{{ $invoice->number }}</th>
        <td>{{ $invoice->customer->name }}</td>
        <td>
            <button type="button"
                    aria-expanded="false"
                    aria-controls="detail-{{ $invoice->id }}">
                {{ __('Details') }}
                <span class="sr-only">{{ __('for invoice :n', ['n' => $invoice->number]) }}</span>
            </button>
        </td>
    </tr>
    <tr id="detail-{{ $invoice->id }}" hidden>
        <td colspan="3">
            <dl class="detail-list">
                <dt>{{ __('Created') }}</dt><dd>{{ $invoice->created_at->isoFormat('LL') }}</dd>
                <dt>{{ __('Reference') }}</dt><dd>{{ $invoice->reference }}</dd>
            </dl>
        </td>
    </tr>
</tbody>
```

`<dl>` is the right element for label/value pairs. The toggle is a real button with
`aria-expanded`.

---

## Rules that apply to every strategy

- **Never** let a table cause page-level horizontal scroll — always a scroll container
- Numeric columns: `text-align: end` and `font-variant-numeric: tabular-nums`
- Currency via `Number::currency()`, never manual concatenation
- Dates via `isoFormat()` with a locale, never a hardcoded format string
- `<caption>` on every table, even if visually hidden
- `min-inline-size: 0` on the grid/flex parent of the scroll container
- Long cell content: `overflow-wrap: anywhere` on cells that can contain emails/URLs
- Row actions: never icon-only without an accessible name that includes the row identity
- Pagination, not infinite scroll, for data tables — it is keyboard-navigable and
  bookmarkable

---

## Server side

Wide tables usually mean lots of rows too.

```php
// Keyset pagination for large tables — see laravel-database-scale
$invoices = Invoice::query()
    ->with('customer:id,name')          // avoid N+1 — see laravel-performance
    ->orderByDesc('id')
    ->cursorPaginate(25);
```

Choose a page size that fits the layout: 25 rows is reasonable on desktop; on mobile, the
card stack makes 25 cards a very long page — consider 10–15 for small screens, or let
users choose.
