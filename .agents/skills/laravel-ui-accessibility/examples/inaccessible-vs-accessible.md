# Before and after — six real patterns

---

## 1. The fake button

```blade
{{-- ✗ --}}
<div class="btn btn-primary" onclick="deleteItem({{ $item->id }})">
    <i class="fa fa-trash"></i>
</div>
```

Fails 2.1.1 (not focusable), 4.1.2 (no role, no name), 2.5.8 (likely undersized),
2.5.3 (no name at all).

```blade
{{-- ✓ --}}
<form method="post" action="{{ route('items.destroy', $item) }}">
    @csrf @method('DELETE')
    <button type="submit" class="btn btn--danger icon-button"
            aria-label="{{ __('Delete :name', ['name' => $item->name]) }}">
        <svg aria-hidden="true" focusable="false" width="20" height="20">
            <use href="#icon-trash"></use>
        </svg>
    </button>
</form>
```

Also fixes a security problem: a destructive action over GET/JS with no CSRF token is
vulnerable to CSRF. See `laravel-security`.

---

## 2. The placeholder-as-label form

```blade
{{-- ✗ --}}
<input type="text" placeholder="Email" class="form-control @error('email') is-invalid @enderror">
@error('email')<div class="text-danger">{{ $message }}</div>@enderror
```

Fails 1.3.1, 3.3.1, 3.3.2, 1.4.3 (placeholder contrast), 1.3.5 (no autocomplete), and the
error is not associated with the field.

```blade
{{-- ✓ --}}
<div class="field">
    <label for="email">{{ __('Email address') }}</label>
    <input
        type="email" id="email" name="email"
        value="{{ old('email') }}"
        autocomplete="email" inputmode="email" required
        aria-describedby="@error('email') email-error @enderror"
        @error('email') aria-invalid="true" @enderror
    >
    @error('email')
        <p id="email-error" class="field__error">
            <svg aria-hidden="true" focusable="false"><use href="#icon-alert"></use></svg>
            <span class="sr-only">{{ __('Error:') }}</span>{{ $message }}
        </p>
    @enderror
</div>
```

---

## 3. Status by colour

```blade
{{-- ✗ — a colour-blind or screen-reader user gets nothing --}}
<span class="dot" style="background: {{ $order->paid ? 'green' : 'red' }}"></span>
```

```blade
{{-- ✓ — colour + shape + text --}}
<span class="badge badge--{{ $order->status->color() }}">
    <svg aria-hidden="true" focusable="false" width="16" height="16">
        <use href="#icon-{{ $order->status->icon() }}"></use>
    </svg>
    {{ $order->status->label() }}
</span>
```

```php
enum OrderStatus: string
{
    case Paid    = 'paid';
    case Pending = 'pending';
    case Failed  = 'failed';

    public function label(): string
    {
        return match ($this) {
            self::Paid    => __('Paid'),
            self::Pending => __('Awaiting payment'),
            self::Failed  => __('Payment failed'),
        };
    }

    public function icon(): string
    {
        return match ($this) {
            self::Paid    => 'check-circle',
            self::Pending => 'clock',
            self::Failed  => 'x-circle',
        };
    }

    public function color(): string
    {
        return match ($this) {
            self::Paid    => 'success',
            self::Pending => 'warning',
            self::Failed  => 'danger',
        };
    }
}
```

Putting label/icon/colour on the enum guarantees they stay in sync everywhere.

---

## 4. The heading-shaped div

```blade
{{-- ✗ — sized like a heading, invisible to heading navigation --}}
<div class="text-2xl font-bold mb-4">{{ $section->title }}</div>
<p class="text-lg font-semibold">{{ $subsection->title }}</p>
```

```blade
{{-- ✓ — real headings, styled with classes --}}
<h2 class="text-2xl font-bold mb-4">{{ $section->title }}</h2>
<h3 class="text-lg font-semibold">{{ $subsection->title }}</h3>
```

A screen-reader user navigating by `H` skips the entire page structure in the first
version. Never skip a level to get a size — that is what CSS is for.

---

## 5. The custom dropdown that traps you

```blade
{{-- ✗ --}}
<div class="dropdown" onmouseover="this.classList.add('open')"
                      onmouseout="this.classList.remove('open')">
    <span>{{ __('Account') }}</span>
    <div class="dropdown-menu">
        <div onclick="location.href='/profile'">{{ __('Profile') }}</div>
        <div onclick="location.href='/logout'">{{ __('Sign out') }}</div>
    </div>
</div>
```

Hover-only (no keyboard, no touch), no roles, no `aria-expanded`, items are unfocusable
divs, no Escape, no focus return, and sign-out over GET is CSRF-vulnerable.

```blade
{{-- ✓ --}}
<div class="dropdown" x-data="{ open: false }"
     @keydown.escape="open = false; $refs.trigger.focus()">
    <button type="button" x-ref="trigger" @click="open = !open"
            :aria-expanded="open.toString()" aria-controls="account-menu">
        {{ __('Account') }}
        <svg aria-hidden="true" focusable="false"><use href="#icon-chevron"></use></svg>
    </button>

    <ul id="account-menu" x-show="open" x-cloak @click.outside="open = false">
        <li><a href="{{ route('profile.edit') }}">{{ __('Profile') }}</a></li>
        <li>
            <form method="post" action="{{ route('logout') }}">
                @csrf
                <button type="submit">{{ __('Sign out') }}</button>
            </form>
        </li>
    </ul>
</div>
```

---

## 6. The silent live update

```blade
{{-- ✗ — results change; a screen-reader user hears nothing --}}
<input type="search" wire:model.live.debounce.300ms="query">
<ul>
    @foreach ($results as $result)
        <li>{{ $result->name }}</li>
    @endforeach
</ul>
```

```blade
{{-- ✓ --}}
<div class="field">
    <label for="search">{{ __('Search invoices') }}</label>
    <input type="search" id="search" wire:model.live.debounce.300ms="query"
           aria-describedby="search-status">
</div>

{{-- Live region present on first render, BEFORE any content is injected --}}
<div id="search-status" role="status" aria-live="polite" aria-atomic="true" class="sr-only">
    @if ($query !== '')
        {{ trans_choice(
            ':count result for ":query"|:count results for ":query"',
            $results->count(),
            ['count' => $results->count(), 'query' => $query]
        ) }}
    @endif
</div>

<div wire:loading.delay role="status">
    <span class="sr-only">{{ __('Searching') }}</span>
</div>

<ul>
    @forelse ($results as $result)
        <li><a href="{{ route('invoices.show', $result) }}">{{ $result->name }}</a></li>
    @empty
        <li>{{ __('No invoices match your search.') }}</li>
    @endforelse
</ul>
```

Three fixes: the input is labelled, the result count is announced politely, and the empty
state is real text rather than a blank list.

---

## The pattern behind all six

Each failure came from choosing a visual outcome and reaching for the nearest `<div>`.
Each fix came from asking: **what is this, semantically?** A thing you press is a button.
A thing that describes a field is a label. A thing that names a section is a heading. Get
that right and most of WCAG follows without effort.
