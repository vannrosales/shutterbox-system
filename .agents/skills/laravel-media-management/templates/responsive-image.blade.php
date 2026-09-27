{{--
    Responsive image component.

    Satisfies simultaneously:
      - laravel-media-management : modern formats, correct derivative selection
      - laravel-ui-accessibility  : alt text, no decorative noise, processing status
      - laravel-responsive-design : sizes attribute, no layout shift
      - laravel-performance       : lazy below the fold, fetchpriority on the LCP

    Usage:
      <x-media.image :media="$post->cover" sizes="(min-width: 62rem) 50vw, 100vw" priority />
      <x-media.image :media="$item->thumb" size="thumb" sizes="200px" />
      <x-media.image :media="$icon" decorative />
--}}

@props([
    'media',
    'size'       => 'medium',
    'sizes'      => '100vw',
    'priority'   => false,      // true for the LCP image only
    'decorative' => false,      // true only when the image adds no information
    'class'      => '',
])

@php
    // A decorative image takes alt="" — NOT a missing alt, which makes screen
    // readers announce the filename.
    $alt = $decorative ? '' : ($media->alt ?? '');

    // The LCP image must be eager and high priority. Lazy-loading it makes LCP
    // worse, which is the single most common image performance mistake.
    $loading  = $priority ? 'eager' : 'lazy';
    $priorityAttr = $priority ? 'high' : 'auto';
@endphp

@if ($media->isProcessed() && $media->isImage())

    <picture>
        {{-- Best compression first; the browser takes the first type it supports --}}
        @if ($srcset = $media->srcset('avif'))
            <source type="image/avif" srcset="{{ $srcset }}" sizes="{{ $sizes }}">
        @endif

        @if ($srcset = $media->srcset('webp'))
            <source type="image/webp" srcset="{{ $srcset }}" sizes="{{ $sizes }}">
        @endif

        <img
            src="{{ $media->url($size, 'jpg') }}"
            {{-- width/height are MANDATORY: they reserve space and prevent CLS --}}
            width="{{ $media->width }}"
            height="{{ $media->height }}"
            alt="{{ $alt }}"
            loading="{{ $loading }}"
            fetchpriority="{{ $priorityAttr }}"
            decoding="async"
            @if ($media->placeholder)
                style="background-image:url('{{ $media->placeholder }}');background-size:cover;background-position:center"
            @endif
            {{ $attributes->merge(['class' => $class]) }}
        >
    </picture>

@elseif ($media->hasFailed())

    {{-- Processing failed: serve the original rather than showing nothing --}}
    <img
        src="{{ $media->url() }}"
        width="{{ $media->width }}"
        height="{{ $media->height }}"
        alt="{{ $alt }}"
        loading="{{ $loading }}"
        decoding="async"
        {{ $attributes->merge(['class' => $class]) }}
    >

@else

    {{--
        Still processing. role="status" so the state is announced rather than
        appearing as an unexplained blank area. aspect-ratio reserves the space
        so nothing shifts when the image arrives.
    --}}
    <div
        role="status"
        class="media-placeholder {{ $class }}"
        @if ($media->width && $media->height)
            style="aspect-ratio: {{ $media->width }} / {{ $media->height }}"
        @endif
    >
        <span class="sr-only">{{ __('Image is still being processed.') }}</span>
    </div>

@endif

{{--
    ─────────────────────────────────────────────────────────────────────────
    Getting `sizes` right matters more than people expect.

    It tells the browser how wide the image will RENDER, before CSS has loaded,
    so it can pick the correct srcset entry. Wrong sizes = wrong variant
    downloaded, usually far too large.

      Full-bleed hero          sizes="100vw"
      Half-width from lg up    sizes="(min-width: 62rem) 50vw, 100vw"
      Fixed thumbnail          sizes="200px"
      3-col grid from md up    sizes="(min-width: 48rem) 33vw, 100vw"
      Content column, capped   sizes="(min-width: 75rem) 60rem, 100vw"

    Keep it in step with the actual CSS — see laravel-responsive-design.

    ─────────────────────────────────────────────────────────────────────────
    alt text — laravel-ui-accessibility owns the rules; the short version:

      Informative   describe what matters about it in context
      Decorative    alt="" (pass `decorative`) — never omit the attribute
      Functional    describe the ACTION, not the picture ("Search", not "magnifier")
      Complex       short alt + a full description nearby (figcaption or aria-describedby)

    Make `alt` a REQUIRED, validated field at upload. A nullable alt column
    will be null.

    ─────────────────────────────────────────────────────────────────────────
    In a list, eager load or every row costs a query:

      $posts = Post::with('media')->paginate(20);

    See laravel-performance.
    ─────────────────────────────────────────────────────────────────────────
--}}
