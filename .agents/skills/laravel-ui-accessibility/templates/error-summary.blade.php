{{--
    Error summary — required for any form with more than ~3 fields.

    This is the single highest-value form accessibility feature. Without it, a
    keyboard or screen-reader user who submits an invalid form gets no indication
    that anything went wrong: focus stays where it was, and the errors are
    somewhere further down the page.

    Satisfies WCAG 2.2:
      3.3.1 Error Identification      errors described in text
      3.3.3 Error Suggestion          each message says how to fix it
      2.4.3 Focus Order               focus moves to the summary on failure
      4.1.3 Status Messages           role="alert" announces it immediately

    Usage:
      <x-form.error-summary />

    Place it directly INSIDE <form>, before the first field.
--}}

@props([
    'title' => null,
])

@if ($errors->any())
    <div
        id="error-summary"
        class="error-summary"
        {{-- role="alert" is assertive: it interrupts, which is correct for a
             submission failure the user must act on. --}}
        role="alert"
        {{-- tabindex="-1" makes it programmatically focusable so JS can move
             focus here. It stays OUT of the tab order. --}}
        tabindex="-1"
        data-error-summary
        {{ $attributes->merge(['class' => 'error-summary']) }}
    >
        <h2 class="error-summary__title">
            {{ $title ?? trans_choice(
                'There is a problem with 1 answer|There are problems with :count answers',
                $errors->count(),
                ['count' => $errors->count()],
            ) }}
        </h2>

        <ul class="error-summary__list">
            @foreach ($errors->keys() as $field)
                <li>
                    {{--
                        Each entry links to the field's id. The user activates it
                        and lands directly on the broken input. This is what makes
                        the summary useful rather than decorative.

                        Dotted names (items.0.quantity) must match the id you
                        generated on the input — normalise both the same way.
                    --}}
                    <a href="#{{ str_replace(['.', '*'], ['-', ''], $field) }}">
                        {{ $errors->first($field) }}
                    </a>
                </li>
            @endforeach
        </ul>
    </div>
@endif

{{--
    ─────────────────────────────────────────────────────────────────────────
    Move focus to the summary after a failed submit.

    WITHOUT THIS THE SUMMARY IS INVISIBLE to keyboard and screen-reader users —
    they submit, the page reloads, focus resets to the top of the document, and
    nothing tells them anything failed.

    Standard form submission (page reload):

        document.addEventListener('DOMContentLoaded', () => {
            document.querySelector('[data-error-summary]')?.focus();
        });

    Livewire (no page reload, so this must fire per validation round trip):

        <div x-data x-on:validation-failed.window="$refs.summary?.focus()">
            <div x-ref="summary" tabindex="-1" role="alert">...</div>
        </div>

        // In the Livewire component
        protected function onValidationError(ValidationException $e): void
        {
            $this->dispatch('validation-failed');
        }

    Inertia:

        router.on('error', () => {
            document.querySelector('[data-error-summary]')?.focus();
        });

    ─────────────────────────────────────────────────────────────────────────
    The link targets must match the field ids.

    Laravel's error keys use dot notation for nested fields:

        'items.0.quantity'  →  <input id="items-0-quantity">

    Normalise identically on both sides, or the link goes nowhere:

        @php $id = str_replace(['.', '*'], ['-', ''], $name); @endphp
        <input id="{{ $id }}" name="{{ $name }}">

    ─────────────────────────────────────────────────────────────────────────
    Anchor targets must clear a sticky header (WCAG 2.4.11):

        [id] { scroll-margin-top: calc(var(--sticky-header-height) + 1rem); }

    ─────────────────────────────────────────────────────────────────────────
    Minimum styling. Colour is never the only signal (WCAG 1.4.1) — the heading
    text and the border thickness both carry the meaning.

    .error-summary {
        border: 4px solid #b91c1c;
        padding: 1rem 1.25rem;
        margin-block-end: 1.5rem;
    }

    .error-summary:focus-visible {
        outline: 3px solid var(--focus-color, #1d4ed8);
        outline-offset: 2px;
    }

    .error-summary__title {
        margin-block-start: 0;
        font-size: var(--step-1, 1.25rem);
        color: #991b1b;
    }

    .error-summary__list a {
        color: #991b1b;
        text-decoration: underline;
        font-weight: 600;
    }

    ─────────────────────────────────────────────────────────────────────────
    Test it:

    it('renders an error summary and links each error to its field', function (): void {
        $response = $this->post(route('applications.store'), []);

        $html = $this->followRedirects($response)->getContent();

        expect($html)
            ->toContain('role="alert"')
            ->toContain('data-error-summary')
            ->toContain('href="#email"');
    });
    ─────────────────────────────────────────────────────────────────────────
--}}
