{{--
    Accessible base layout.
    Every element here satisfies a specific WCAG 2.2 criterion — see the inline notes.
--}}
<!DOCTYPE html>
<html
    lang="{{ str_replace('_', '-', app()->getLocale()) }}"
    dir="{{ in_array(app()->getLocale(), ['ar', 'he', 'fa', 'ur']) ? 'rtl' : 'ltr' }}"
>
<head>
    <meta charset="utf-8">
    {{-- SC 1.4.4: never add user-scalable=no or maximum-scale --}}
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="description" content="{{ $description ?? config('app.description') }}">

    {{-- SC 2.4.2: unique, page-specific, descriptive text FIRST --}}
    <title>{{ ($title ?? null) ? $title . ' — ' . config('app.name') : config('app.name') }}</title>

    <link rel="canonical" href="{{ url()->current() }}">
    @vite(['resources/css/app.css', 'resources/js/app.js'])
    @stack('head')
</head>
<body class="antialiased">

    {{-- SC 2.4.1: first focusable element on the page --}}
    <a href="#main" class="skip-link">{{ __('Skip to main content') }}</a>
    @if (! empty($hasSearch))
        <a href="#search" class="skip-link">{{ __('Skip to search') }}</a>
    @endif

    {{-- SC 4.1.3: live regions must exist BEFORE content is injected into them --}}
    <div id="route-announcer" role="status" aria-live="polite" class="sr-only"></div>
    <div id="toasts" role="status" aria-live="polite" aria-atomic="false" class="toasts"></div>

    <header class="site-header">
        {{-- SC 1.3.1: banner landmark --}}
        <div class="site-header__inner">
            <a href="{{ route('home') }}" class="site-header__logo">
                {{-- SC 1.1.1: logo needs a text alternative naming the organisation --}}
                <img src="{{ asset('img/logo.svg') }}"
                     alt="{{ config('app.name') }}"
                     width="160" height="40">
            </a>

            {{-- SC 2.4.1/3.2.3: each nav needs a distinguishing label --}}
            <nav aria-label="{{ __('Primary') }}">
                <ul class="nav">
                    @foreach ($navigation ?? [] as $item)
                        <li>
                            <a href="{{ $item['url'] }}"
                               @if (request()->routeIs($item['route'])) aria-current="page" @endif>
                                {{ $item['label'] }}
                            </a>
                        </li>
                    @endforeach
                </ul>
            </nav>

            {{-- SC 3.1.2: lang on each language name --}}
            <nav aria-label="{{ __('Language') }}">
                <ul class="lang-switch">
                    @foreach (config('app.supported_locales', ['en']) as $locale)
                        <li>
                            <a href="{{ route('locale.switch', $locale) }}"
                               lang="{{ $locale }}"
                               hreflang="{{ $locale }}"
                               @if (app()->getLocale() === $locale) aria-current="true" @endif>
                                {{ ['en' => 'English', 'fil' => 'Filipino'][$locale] ?? $locale }}
                            </a>
                        </li>
                    @endforeach
                </ul>
            </nav>
        </div>
    </header>

    @isset($breadcrumbs)
        {{-- SC 2.4.5 Multiple Ways / SC 2.4.8 Location --}}
        <nav aria-label="{{ __('Breadcrumb') }}" class="breadcrumbs">
            <ol>
                @foreach ($breadcrumbs as $crumb)
                    <li>
                        @if (! $loop->last)
                            <a href="{{ $crumb['url'] }}">{{ $crumb['label'] }}</a>
                        @else
                            <span aria-current="page">{{ $crumb['label'] }}</span>
                        @endif
                    </li>
                @endforeach
            </ol>
        </nav>
    @endisset

    {{-- SC 3.3.1: flash messages announced immediately --}}
    @if (session('status'))
        <div role="alert" class="alert alert--success">
            <svg aria-hidden="true" focusable="false"><use href="#icon-check"></use></svg>
            <span class="sr-only">{{ __('Success:') }}</span>
            {{ session('status') }}
        </div>
    @endif

    @if (session('error'))
        <div role="alert" class="alert alert--danger">
            <svg aria-hidden="true" focusable="false"><use href="#icon-alert"></use></svg>
            <span class="sr-only">{{ __('Error:') }}</span>
            {{ session('error') }}
        </div>
    @endif

    {{-- tabindex="-1" so the skip link can move focus here --}}
    <main id="main" tabindex="-1">
        {{-- SC 1.3.1/2.4.6: exactly one h1, matching the page title --}}
        <h1>{{ $heading ?? $title }}</h1>

        {{ $slot }}
    </main>

    <footer class="site-footer">
        {{-- SC 3.2.6 Consistent Help: same location on every page --}}
        <nav aria-label="{{ __('Footer') }}">
            <ul>
                <li><a href="{{ route('accessibility') }}">{{ __('Accessibility statement') }}</a></li>
                <li><a href="{{ route('privacy') }}">{{ __('Privacy notice') }}</a></li>
                <li><a href="{{ route('terms') }}">{{ __('Terms of use') }}</a></li>
                <li><a href="{{ route('contact') }}">{{ __('Contact us') }}</a></li>
                <li><a href="{{ route('sitemap') }}">{{ __('Sitemap') }}</a></li>
            </ul>
        </nav>
        <p>&copy; {{ now()->year }} {{ config('app.name') }}</p>
    </footer>

    {{-- Sprite sheet: icons referenced by <use href="#icon-*">, hidden from AT --}}
    <svg xmlns="http://www.w3.org/2000/svg" style="display:none" aria-hidden="true">
        <symbol id="icon-check" viewBox="0 0 24 24">...</symbol>
        <symbol id="icon-alert" viewBox="0 0 24 24">...</symbol>
    </svg>

    @stack('scripts')
</body>
</html>
