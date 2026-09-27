# Accessible forms in Laravel

Forms produce more accessibility defects than every other component combined.

## The complete field

```blade
{{-- resources/views/components/form/input.blade.php --}}
@props([
    'name',
    'label',
    'type'  => 'text',
    'hint'  => null,
    'required' => false,
    'autocomplete' => null,
])

@php
    $id        = $attributes->get('id', $name);
    $errorId   = "{$id}-error";
    $hintId    = "{$id}-hint";
    $describedBy = collect([$hint ? $hintId : null, $errors->has($name) ? $errorId : null])
        ->filter()->implode(' ');
@endphp

<div class="field">
    <label for="{{ $id }}">
        {{ $label }}
        @if ($required)
            <span aria-hidden="true">*</span>
            <span class="sr-only">{{ __('(required)') }}</span>
        @endif
    </label>

    @if ($hint)
        <p id="{{ $hintId }}" class="field__hint">{{ $hint }}</p>
    @endif

    <input
        type="{{ $type }}"
        id="{{ $id }}"
        name="{{ $name }}"
        value="{{ old($name, $attributes->get('value')) }}"
        @if ($required) required @endif
        @if ($autocomplete) autocomplete="{{ $autocomplete }}" @endif
        @if ($describedBy) aria-describedby="{{ $describedBy }}" @endif
        @error($name) aria-invalid="true" @enderror
        {{ $attributes->except(['id', 'value']) }}
    >

    @error($name)
        <p id="{{ $errorId }}" class="field__error">
            <svg class="field__error-icon" aria-hidden="true" focusable="false">
                <use href="#icon-alert"></use>
            </svg>
            <span class="sr-only">{{ __('Error:') }}</span>
            {{ $message }}
        </p>
    @enderror
</div>
```

Usage:

```blade
<x-form.input
    name="email"
    :label="__('Email address')"
    type="email"
    required
    autocomplete="email"
    inputmode="email"
    :hint="__('We will only use this to contact you about your application.')"
/>
```

Why each piece:

| Piece | Without it |
|---|---|
| `for`/`id` | Screen reader announces "edit text, blank" with no field name |
| `aria-describedby` | Hint and error are visually present but never announced |
| `aria-invalid` | No state announced; the user hears nothing wrong |
| `sr-only "(required)"` | A bare `*` is announced as "star" or skipped |
| `sr-only "Error:"` | The message reads as ordinary text with no severity |
| Icon `aria-hidden` | The icon is announced as meaningless graphic noise |
| `autocomplete` | Fails SC 1.3.5; password managers and autofill break |

## Grouped controls

Radios and checkboxes that form one question **must** be in a fieldset — otherwise the
question itself is never announced.

```blade
<fieldset @error('delivery') aria-describedby="delivery-error" aria-invalid="true" @enderror>
    <legend>{{ __('How should we deliver your documents?') }}</legend>

    <div class="choice">
        <input type="radio" id="delivery-email" name="delivery" value="email"
               @checked(old('delivery') === 'email')>
        <label for="delivery-email">{{ __('By email') }}</label>
    </div>

    <div class="choice">
        <input type="radio" id="delivery-pickup" name="delivery" value="pickup"
               @checked(old('delivery') === 'pickup')>
        <label for="delivery-pickup">{{ __('Pick up at the office') }}</label>
    </div>

    @error('delivery')
        <p id="delivery-error" class="field__error">{{ $message }}</p>
    @enderror
</fieldset>
```

Address blocks, date-part inputs (day/month/year), and card details all need the same
treatment.

## Error summary — required for any form over ~3 fields

```blade
{{-- resources/views/components/form/error-summary.blade.php --}}
@if ($errors->any())
    <div
        class="error-summary"
        role="alert"
        tabindex="-1"
        id="error-summary"
        data-autofocus
    >
        <h2 class="error-summary__title">
            {{ trans_choice(
                'There is a problem with 1 answer|There are problems with :count answers',
                $errors->count(),
                ['count' => $errors->count()]
            ) }}
        </h2>

        <ul class="error-summary__list">
            @foreach ($errors->keys() as $field)
                <li>
                    <a href="#{{ $field }}">{{ $errors->first($field) }}</a>
                </li>
            @endforeach
        </ul>
    </div>
@endif
```

```js
// Move focus to the summary after a failed submit — without this it is invisible
// to keyboard and screen-reader users.
document.addEventListener('DOMContentLoaded', () => {
    document.querySelector('[data-autofocus]')?.focus();
});
```

Each entry links to `#field-id`, so the user activates it and lands on the broken field.
This is the single highest-value form accessibility feature.

Livewire equivalent — re-focus after each validation round trip:

```blade
<div x-data x-on:validation-failed.window="$refs.summary?.focus()">
    <div x-ref="summary" tabindex="-1" role="alert">...</div>
</div>
```

```php
// In the Livewire component
protected function onValidationError(ValidationException $e): void
{
    $this->dispatch('validation-failed');
}
```

## Client-side validation must not replace server-side

Use `required`, `type`, `pattern`, `minlength` for fast feedback, but:

- Native browser bubbles are inconsistently announced — render your own messages.
- `novalidate` on the form + your own JS gives control over messaging.
- **Server-side validation is the real validation.** Client-side is a convenience.
  See `laravel-security`.

## Field types — get them right

```blade
<input type="email"  inputmode="email"   autocomplete="email">
<input type="tel"    inputmode="tel"     autocomplete="tel">
<input type="url"    inputmode="url">
<input type="search" role="searchbox">
{{-- Numbers: use inputmode, not type=number — type=number has spinner and
     scroll-wheel-changes-value problems, and strips leading zeros from IDs/postcodes --}}
<input type="text" inputmode="numeric" pattern="[0-9]*" autocomplete="postal-code">
{{-- Money --}}
<input type="text" inputmode="decimal">
```

`type="number"` is appropriate for genuine quantities where increment/decrement makes
sense. It is wrong for phone numbers, postcodes, PINs, and reference numbers.

## Dates

Native `<input type="date">` is well supported and keyboard-accessible; its main cost is
inconsistent locale formatting. A three-field day/month/year group inside a fieldset is
often more usable for date-of-birth, and is what most government design systems use.

Custom JS datepickers must implement the full APG grid pattern (arrow keys, PageUp/Down,
Home/End, Escape) — if you are not doing that, do not build one.

## File upload

```blade
<div class="field">
    <label for="document">{{ __('Upload your document') }}</label>
    <p id="document-hint" class="field__hint">
        {{ __('PDF, JPG or PNG. Maximum 10 MB.') }}
    </p>
    <input
        type="file"
        id="document"
        name="document"
        accept=".pdf,.jpg,.jpeg,.png"
        aria-describedby="document-hint @error('document') document-error @enderror"
        @error('document') aria-invalid="true" @enderror
    >
    @error('document')
        <p id="document-error" class="field__error">{{ $message }}</p>
    @enderror
</div>
```

- State accepted formats and the size limit **before** upload, not in the error.
- A styled drop zone must keep a real `<input type="file">` reachable — hide it with
  `sr-only`, never `display:none`, and pair it with a visible `<label>` that acts as the
  button.
- Upload progress needs `role="status"` + `aria-live="polite"`, or `<progress>`.
- Drag-and-drop is a supplement, never the only path (SC 2.5.7).

Validation and storage rules: `laravel-media-management`.

## Multi-step forms

- A visible step indicator: "Step 2 of 5 — Contact details".
- The page `<title>` includes the step so the tab and history are meaningful.
- Every step is a real navigation, or focus moves to the new step's heading.
- Back preserves entered data (SC 3.3.7 Redundant Entry).
- A review step before submission (SC 3.3.4).

```blade
<nav aria-label="{{ __('Progress') }}">
    <ol class="steps">
        @foreach ($steps as $i => $step)
            <li>
                @if ($i < $current)
                    <a href="{{ route('apply.step', $i) }}">
                        <span class="sr-only">{{ __('Completed:') }}</span>{{ $step }}
                    </a>
                @elseif ($i === $current)
                    <span aria-current="step">{{ $step }}</span>
                @else
                    <span>{{ $step }}</span>
                @endif
            </li>
        @endforeach
    </ol>
</nav>
```

## Common failures

| Failure | Fix |
|---|---|
| Placeholder as the only label | Add a real `<label>` |
| `<label>Email <input></label>` without `for` | Implicit works but is fragile; always add `for`/`id` |
| Error shown only as a red border | Add text, icon, `aria-invalid`, `aria-describedby` |
| Disabled submit until valid | Keep it enabled; explain on submit |
| `autofocus` on the first field | Skips the header and skip link |
| Errors rendered but focus stays put | Move focus to the summary |
| Same `id` repeated in a loop | Suffix with the index — duplicate ids break `for` |
| Toast-only error feedback | Toasts disappear; render errors inline as well |
| Required marked only by colour | Add `*` plus visually-hidden "(required)" |
| `<div>` wrapping radios with no fieldset | The question is never announced |
