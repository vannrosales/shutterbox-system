# Accessible component patterns

Follow the W3C ARIA Authoring Practices Guide (APG) shapes. Where a native element exists,
use it — every pattern below prefers HTML over ARIA.

---

## Modal / dialog

Native `<dialog>` handles focus trap, Escape, and the top layer for you.

```blade
<button type="button" data-open-dialog="confirm-delete">
    {{ __('Delete invoice') }}
</button>

<dialog id="confirm-delete" aria-labelledby="confirm-delete-title">
    <h2 id="confirm-delete-title">{{ __('Delete this invoice?') }}</h2>
    <p>{{ __('Invoice :number will be permanently removed. This cannot be undone.', ['number' => $invoice->number]) }}</p>

    <form method="dialog">
        <button type="submit" value="cancel">{{ __('Cancel') }}</button>
    </form>
    <form method="post" action="{{ route('invoices.destroy', $invoice) }}">
        @csrf @method('DELETE')
        <button type="submit" class="btn--danger">{{ __('Yes, delete it') }}</button>
    </form>
</dialog>
```

```js
document.querySelectorAll('[data-open-dialog]').forEach((trigger) => {
    const dialog = document.getElementById(trigger.dataset.openDialog);
    trigger.addEventListener('click', () => dialog.showModal());
    // showModal() returns focus to the trigger on close automatically.
});
```

`showModal()` (not `show()`) gives: focus moved inside, focus trapped, Escape closes,
content behind marked inert, and focus restored to the trigger. Hand-rolled modals miss at
least one of these.

If you cannot use `<dialog>`:

```html
<div role="dialog" aria-modal="true" aria-labelledby="title-id">
```
plus JS for: initial focus, focus trap, Escape, `inert` on the background, focus return.
`templates/focus-trap.js` has a tested implementation.

**Rules regardless of implementation:**
- Labelled by its heading (`aria-labelledby`), or `aria-label` if headingless
- Focus lands on the dialog or its first control, **not** on a "close" X
- Focus returns to the element that opened it
- Escape closes (unless data loss is at stake — then confirm)
- Background does not scroll
- Not the place for long forms; a modal that scrolls is usually a page

---

## Dropdown / disclosure menu

```blade
<div class="dropdown" x-data="{ open: false }" @keydown.escape="open = false; $refs.trigger.focus()">
    <button
        type="button"
        x-ref="trigger"
        @click="open = !open"
        :aria-expanded="open.toString()"
        aria-controls="account-menu"
    >
        {{ __('Account') }}
        <svg aria-hidden="true" focusable="false">...</svg>
    </button>

    <ul id="account-menu" x-show="open" x-cloak @click.outside="open = false">
        <li><a href="{{ route('profile.edit') }}">{{ __('Profile') }}</a></li>
        <li><a href="{{ route('billing') }}">{{ __('Billing') }}</a></li>
        <li>
            <form method="post" action="{{ route('logout') }}">
                @csrf
                <button type="submit">{{ __('Sign out') }}</button>
            </form>
        </li>
    </ul>
</div>
```

- Trigger is a real `<button>` with `aria-expanded` reflecting state
- Escape closes **and returns focus to the trigger**
- `x-cloak` + CSS `[x-cloak]{display:none}` so the menu is truly hidden from AT
- Do **not** add `role="menu"`/`role="menuitem"` to a list of links — that role implies
  application-style arrow-key semantics you probably have not implemented. A disclosure of
  links is a disclosure.

Use `role="menu"` only for true application menus, and then implement arrow keys, Home/End,
type-ahead, and roving tabindex per APG.

---

## Tabs

```blade
<div x-data="{ tab: 'details' }">
    <div role="tablist" aria-label="{{ __('Invoice sections') }}">
        @foreach (['details' => __('Details'), 'history' => __('History')] as $key => $label)
            <button
                type="button"
                role="tab"
                :id="'tab-{{ $key }}'"
                :aria-selected="(tab === '{{ $key }}').toString()"
                aria-controls="panel-{{ $key }}"
                :tabindex="tab === '{{ $key }}' ? 0 : -1"
                @click="tab = '{{ $key }}'"
                @keydown.right.prevent="/* focus next tab */"
                @keydown.left.prevent="/* focus previous tab */"
                @keydown.home.prevent="/* focus first */"
                @keydown.end.prevent="/* focus last */"
            >{{ $label }}</button>
        @endforeach
    </div>

    @foreach (['details', 'history'] as $key)
        <div role="tabpanel" id="panel-{{ $key }}" aria-labelledby="tab-{{ $key }}"
             tabindex="0" x-show="tab === '{{ $key }}'" x-cloak>
            ...
        </div>
    @endforeach
</div>
```

Roving tabindex: exactly one tab is in the tab order; arrows move between them. This is the
part most implementations get wrong.

If the panels are just links to separate pages, they are **navigation**, not tabs. Use a
`<nav>` with `aria-current="page"`.

---

## Accordion

```blade
<h3>
    <button type="button" aria-expanded="false" aria-controls="section-1" id="accordion-1">
        {{ __('What documents do I need?') }}
    </button>
</h3>
<div id="section-1" role="region" aria-labelledby="accordion-1" hidden>
    ...
</div>
```

The button goes **inside** the heading, so heading navigation still works. Use `hidden`
(not just CSS) so the content is removed from the accessibility tree.

---

## Data table

```blade
<div class="table-scroll" tabindex="0" role="region" aria-labelledby="invoices-caption">
    <table>
        <caption id="invoices-caption">
            {{ __('Invoices') }}
            <span class="sr-only">
                {{ __(':count invoices, sorted by date, newest first', ['count' => $invoices->total()]) }}
            </span>
        </caption>
        <thead>
            <tr>
                <th scope="col">
                    <a href="{{ request()->fullUrlWithQuery(['sort' => 'number']) }}"
                       aria-sort="{{ $sort === 'number' ? $direction : 'none' }}">
                        {{ __('Number') }}
                        <span class="sr-only">{{ __(', activate to sort') }}</span>
                    </a>
                </th>
                <th scope="col">{{ __('Customer') }}</th>
                <th scope="col" class="numeric">{{ __('Amount') }}</th>
                <th scope="col">{{ __('Status') }}</th>
                <th scope="col"><span class="sr-only">{{ __('Actions') }}</span></th>
            </tr>
        </thead>
        <tbody>
            @foreach ($invoices as $invoice)
                <tr>
                    <th scope="row">{{ $invoice->number }}</th>
                    <td>{{ $invoice->customer->name }}</td>
                    <td class="numeric">{{ Number::currency($invoice->total, 'PHP') }}</td>
                    <td>
                        <span class="badge badge--{{ $invoice->status->color() }}">
                            <svg aria-hidden="true" focusable="false">...</svg>
                            {{ $invoice->status->label() }}
                        </span>
                    </td>
                    <td>
                        <a href="{{ route('invoices.show', $invoice) }}">
                            {{ __('View') }}<span class="sr-only"> {{ __('invoice :n', ['n' => $invoice->number]) }}</span>
                        </a>
                    </td>
                </tr>
            @endforeach
        </tbody>
    </table>
</div>
```

- `<caption>` names the table
- `scope="col"` / `scope="row"` — the row header is the identifying cell
- Empty action-column header still needs `sr-only` text
- Scroll container is focusable (`tabindex="0"`) and has a `role="region"` + name, so
  keyboard users can scroll it (SC 1.4.10 exception for tables)
- Per-row action links carry row context for screen readers
- **Never use tables for layout.** If it has no headers, it is not a table.
- Responsive card-stacking on mobile: `laravel-responsive-design`

---

## Pagination

```blade
<nav aria-label="{{ __('Pagination') }}">
    <ul class="pagination">
        <li>
            @if ($paginator->onFirstPage())
                <span aria-disabled="true">{{ __('Previous') }}</span>
            @else
                <a href="{{ $paginator->previousPageUrl() }}" rel="prev">{{ __('Previous') }}</a>
            @endif
        </li>

        @foreach ($elements as $page => $url)
            <li>
                @if ($page == $paginator->currentPage())
                    <a href="{{ $url }}" aria-current="page">
                        <span class="sr-only">{{ __('Page') }}</span> {{ $page }}
                    </a>
                @else
                    <a href="{{ $url }}">
                        <span class="sr-only">{{ __('Go to page') }}</span> {{ $page }}
                    </a>
                @endif
            </li>
        @endforeach
    </ul>
</nav>
```

Publish and edit Laravel's views: `php artisan vendor:publish --tag=laravel-pagination`.
The shipped views are decent but not fully labelled — fix them once, project-wide.

---

## Alerts, toasts, and flash messages

```blade
{{-- Flash message — present on page load, so role=alert is enough --}}
@if (session('status'))
    <div role="alert" class="alert alert--success">
        <svg aria-hidden="true" focusable="false"><use href="#icon-check"></use></svg>
        <span class="sr-only">{{ __('Success:') }}</span>
        {{ session('status') }}
    </div>
@endif

{{-- Toast container — MUST exist in the DOM before any toast is inserted --}}
<div id="toasts" role="status" aria-live="polite" aria-atomic="false" class="toasts"></div>
```

- `role="alert"` = assertive, interrupts. Errors only.
- `role="status"` = polite, waits. Confirmations, counts, saved indicators.
- The live region must be in the DOM **first**. Creating the region and its content in the
  same tick means nothing is announced.
- Do not auto-dismiss anything the user must act on. If you auto-dismiss, minimum ~6s plus
  reading time, and always provide a persistent record elsewhere.
- Dismiss button is a real `<button>` with an accessible name, reachable by keyboard.
- Toasts must not be the only channel for form errors.

---

## Combobox / autocomplete

The hardest pattern to get right. Prefer a native `<select>`, or `<input list>` +
`<datalist>` for simple cases.

If you must build one, implement APG combobox in full: `role="combobox"`,
`aria-expanded`, `aria-controls`, `aria-activedescendant`, `aria-autocomplete="list"`,
a `role="listbox"` popup with `role="option"` children, arrow/Enter/Escape/Home/End
handling, and a `role="status"` region announcing the result count.

Strongly prefer a maintained accessible library over a bespoke implementation here.

---

## Loading and busy states

```blade
<div wire:loading.delay role="status">
    <svg class="spinner" aria-hidden="true" focusable="false">...</svg>
    <span class="sr-only">{{ __('Loading results') }}</span>
</div>

{{-- Long operation --}}
<div role="status" aria-live="polite">
    <progress value="{{ $done }}" max="{{ $total }}">
        {{ __(':percent% complete', ['percent' => round($done / $total * 100)]) }}
    </progress>
</div>
```

A spinner with no text is silent to a screen reader — the user experiences an unexplained
pause. Skeleton screens have the same problem; pair them with a `role="status"`.

---

## Icon buttons

```blade
<button type="button" class="icon-button" aria-label="{{ __('Remove :name from cart', ['name' => $item->name]) }}">
    <svg aria-hidden="true" focusable="false" width="20" height="20"><use href="#icon-trash"></use></svg>
</button>
```

`focusable="false"` on the SVG matters — IE/older Edge put SVGs in the tab order otherwise,
and some AT still trips on it. `min-inline-size: 2.75rem` for target size.

---

## Breadcrumbs

```blade
<nav aria-label="{{ __('Breadcrumb') }}">
    <ol>
        <li><a href="{{ route('home') }}">{{ __('Home') }}</a></li>
        <li><a href="{{ route('invoices.index') }}">{{ __('Invoices') }}</a></li>
        <li><span aria-current="page">{{ $invoice->number }}</span></li>
    </ol>
</nav>
```

Separators go in CSS (`::before`), not in the markup — a `/` in the DOM is announced.
