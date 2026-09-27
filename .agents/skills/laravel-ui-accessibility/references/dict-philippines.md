# Philippine government web context

> **Scope note.** This file summarises the regulatory landscape so you build to the right
> bar from day one. It is **not** a legal authority or a compliance sign-off. Circular
> numbers and mandatory-page lists are revised periodically — confirm current requirements
> with the DICT and the specific agency before certifying compliance. The technical
> guidance below (WCAG 2.2 AA) is stable and safe to build to regardless.

## Legal and policy backdrop

| Instrument | Relevance |
|---|---|
| **RA 7277** — Magna Carta for Persons with Disabilities, as amended by **RA 9442** | Establishes the right of persons with disabilities to access services, including government information services |
| **BP 344** — Accessibility Law | Accessibility obligations for facilities and services |
| **RA 10173** — Data Privacy Act of 2012 | Privacy notices, consent UI, data-subject rights pages, breach handling |
| **RA 11032** — Ease of Doing Business / Efficient Government Service Delivery Act | Citizen's Charter publication, processing-time transparency, streamlined online services |
| **RA 8792** — E-Commerce Act | Legal recognition of electronic documents and signatures |
| **DICT** web accessibility and government web standards issuances | Accessibility conformance targets and common design/content requirements for government websites |
| **Freedom of Information (EO No. 2, s. 2016)** | FOI page and request mechanism for executive-branch agencies |

DICT accessibility guidance is aligned to WCAG. Building to **WCAG 2.2 Level AA** meets or
exceeds the technical conformance target in every version of that guidance, which is why
this skill sets 2.2 AA as the default rather than tracking circular revisions.

## Pages commonly required on Philippine government sites

Confirm the current list for the agency, but plan for:

- **Transparency Seal** — mandated disclosures (mandate, officials, budget, procurement,
  annual reports)
- **Citizen's Charter** — services, requirements, fees, processing times, responsible
  officers (RA 11032)
- **Freedom of Information** — FOI manual, request procedure, registry
- **Privacy Notice / Data Privacy** — RA 10173 disclosures, Data Protection Officer contact
- **Terms of Use**
- **Accessibility Statement** — conformance level claimed, known limitations, and a
  contact route for accessibility problems
- **Contact / Feedback** — including a non-web channel
- **Sitemap** — also satisfies WCAG 2.4.5 Multiple Ways
- **Agency officials directory**
- **Bids and Awards / Procurement notices** where applicable

### Accessibility statement template

Ship one. It is both a requirement in most government web standards and good practice
anywhere.

```blade
<h1>{{ __('Accessibility Statement') }}</h1>

<p>{{ __(':agency is committed to making this website accessible to the widest possible audience, regardless of ability or technology.', ['agency' => config('app.name')]) }}</p>

<h2>{{ __('Conformance status') }}</h2>
<p>{{ __('This website aims to conform to the Web Content Accessibility Guidelines (WCAG) 2.2 Level AA.') }}</p>

<h2>{{ __('Known limitations') }}</h2>
<ul>
    <li>{{ __('Some PDF documents published before :date may not be fully accessible. Accessible versions are available on request.', ['date' => '1 January 2026']) }}</li>
</ul>

<h2>{{ __('Feedback') }}</h2>
<p>{{ __('If you encounter an accessibility barrier, contact us at :email or :phone. We aim to respond within :days working days.', [
    'email' => 'accessibility@agency.gov.ph',
    'phone' => '(02) 8000 0000',
    'days'  => 5,
]) }}</p>

<h2>{{ __('Date') }}</h2>
<p>{{ __('This statement was last reviewed on :date.', ['date' => '31 July 2026']) }}</p>
```

Be honest in "known limitations". An overclaiming statement is worse than none.

## Practical constraints of the Philippine context

These matter as much as the criteria list:

### Language

Filipino and English at minimum. Regional languages where the agency serves a specific
region.

```php
// config/app.php
'locale' => 'en',
'fallback_locale' => 'en',
'supported_locales' => ['en', 'fil'],
```

```blade
<nav aria-label="{{ __('Language') }}">
    @foreach (config('app.supported_locales') as $locale)
        <a href="{{ route('locale.switch', $locale) }}"
           lang="{{ $locale }}"
           @if (app()->getLocale() === $locale) aria-current="true" @endif>
            {{ ['en' => 'English', 'fil' => 'Filipino'][$locale] }}
        </a>
    @endforeach
</nav>
```

Set `lang` on the language link itself, so the name is pronounced correctly.

### Bandwidth and device reality

Mobile-first is not a style preference here — for many users the phone is the only device,
on a metered or congested connection.

- Total page weight budget: target **under 1 MB** on the first load for public pages
- Works without JavaScript for core tasks (forms should submit via a real `<form>` POST)
- Images: responsive `srcset`, modern formats, lazy loading below the fold
  (`laravel-media-management`)
- Test on a throttled 3G profile, not just a desktop connection
- Avoid large web-font payloads; system font stacks are legitimate

### Offline and intermittent connectivity

- Long forms should save progress (draft to server or `localStorage` with a clear notice)
- Never lose a user's typed input to a session timeout without warning (SC 2.2.1)
- Clear, non-technical error messages when a request fails

### Assistive technology in use

NVDA (free, Windows) is the most common screen reader in the region — free tooling on
low-cost hardware. Test with NVDA + Firefox and NVDA + Chrome at minimum. Do not assume
VoiceOver/Safari coverage is representative.

## Government-specific UI patterns

- **Reference numbers**: display prominently, in a copyable element, with a visually-hidden
  "Reference number:" prefix. Users write these down or read them over the phone.
- **Fee display**: `Number::currency($amount, 'PHP')` — never hardcode `₱` with manual
  formatting.
- **Processing times**: state them (RA 11032) — "3 working days", not "soon".
- **Office hours and holidays**: Philippine holidays affect processing-day counts; show
  the actual expected date, not just the day count.
- **Print**: government forms get printed. Ship a `@media print` stylesheet that removes
  navigation, expands accordions, and shows link URLs.

```css
@media print {
    nav, .no-print, .toasts { display: none; }
    details, [aria-expanded="false"] + [hidden] { display: block !important; }
    a[href^="http"]::after { content: " (" attr(href) ")"; font-size: 0.85em; }
}
```

## Handoffs

- Data privacy consent, retention, and breach response → `laravel-security`
- Bandwidth budgets and asset optimisation → `laravel-performance`
- Device/breakpoint coverage → `laravel-responsive-design`
