/**
 * Tailwind config aligned to the project breakpoint matrix.
 *
 * Tailwind is mobile-first: `md:grid-cols-2` means "at md AND UP".
 * If you find yourself reaching for `max-md:`, you are designing desktop-first —
 * restructure instead.
 *
 * Tailwind v4 users: these live in CSS via @theme rather than this file. The values
 * and the reasoning are identical — see the block at the bottom.
 */

/** @type {import('tailwindcss').Config} */
export default {
    content: [
        './resources/**/*.blade.php',
        './resources/**/*.js',
        './resources/**/*.vue',
        './app/View/Components/**/*.php',
        './app/Livewire/**/*.php',
    ],

    theme: {
        // Breakpoints in rem so they respect the user's browser font size.
        // (Media-query rem always resolves against the browser default, not html font-size.)
        screens: {
            'sm':  '36rem',     //  576px — large phone landscape
            'md':  '48rem',     //  768px — tablet portrait / foldable unfolded
            'lg':  '62rem',     //  992px — tablet landscape / small laptop
            'xl':  '75rem',     // 1200px — desktop
            '2xl': '87.5rem',   // 1400px — large desktop
            '3xl': '100rem',    // 1600px — wide; cap content here

            // Capability queries — use instead of assuming a width implies a device
            'hover-hover': { raw: '(hover: hover) and (pointer: fine)' },
            'touch':       { raw: '(pointer: coarse)' },

            // Short viewports (landscape phone) break sticky chrome and modals
            'short':       { raw: '(max-height: 30rem)' },

            'motion-safe': { raw: '(prefers-reduced-motion: no-preference)' },
            'print':       { raw: 'print' },
        },

        container: {
            center: true,
            padding: {
                DEFAULT: '1rem',
                md: '1.5rem',
                xl: '2rem',
            },
            // Cap at 2xl — ultra-wide should centre, not stretch
            screens: {
                sm: '36rem',
                md: '48rem',
                lg: '62rem',
                xl: '75rem',
                '2xl': '82rem',
            },
        },

        extend: {
            // Fluid type. Every step keeps a rem term so browser zoom still works —
            // a pure-vw clamp middle breaks WCAG 1.4.4.
            fontSize: {
                'fluid-sm':   'clamp(0.875rem, 0.85rem + 0.125vw, 0.9375rem)',
                'fluid-base': 'clamp(1rem, 0.95rem + 0.25vw, 1.125rem)',
                'fluid-lg':   'clamp(1.25rem, 1.15rem + 0.5vw, 1.5rem)',
                'fluid-xl':   'clamp(1.5rem, 1.3rem + 1vw, 2rem)',
                'fluid-2xl':  'clamp(1.875rem, 1.5rem + 1.875vw, 3rem)',
                'fluid-3xl':  'clamp(2.25rem, 1.7rem + 2.75vw, 4rem)',
            },

            spacing: {
                'fluid-s':  'clamp(0.75rem, 0.7rem + 0.25vw, 1rem)',
                'fluid-m':  'clamp(1rem, 0.9rem + 0.5vw, 1.5rem)',
                'fluid-l':  'clamp(1.5rem, 1.3rem + 1vw, 2.5rem)',
                'fluid-xl': 'clamp(2rem, 1.6rem + 2vw, 4rem)',

                // Safe areas — needs viewport-fit=cover in the viewport meta
                'safe-t': 'env(safe-area-inset-top)',
                'safe-b': 'env(safe-area-inset-bottom)',
                'safe-l': 'env(safe-area-inset-left)',
                'safe-r': 'env(safe-area-inset-right)',

                // Minimum touch target (WCAG 2.5.8 floor is 24px; 44 is the practical target)
                'touch': '2.75rem',
            },

            // Mobile-correct viewport units. Plain vh overshoots on mobile.
            minHeight: {
                'screen-dynamic': '100dvh',
                'screen-small':   '100svh',
                'screen-large':   '100lvh',
            },
            height: {
                'screen-dynamic': '100dvh',
                'screen-small':   '100svh',
            },

            maxWidth: {
                'prose-safe': '70ch',
            },

            gridTemplateColumns: {
                // min() prevents overflow below the track minimum
                'auto-fit-sm': 'repeat(auto-fit, minmax(min(14rem, 100%), 1fr))',
                'auto-fit-md': 'repeat(auto-fit, minmax(min(18rem, 100%), 1fr))',
                'auto-fit-lg': 'repeat(auto-fit, minmax(min(24rem, 100%), 1fr))',
            },
        },
    },

    plugins: [
        require('@tailwindcss/forms'),
        require('@tailwindcss/typography'),

        // Container queries: components should respond to their container, not the viewport
        require('@tailwindcss/container-queries'),
    ],
};

/* ─────────────────────────────────────────────────────────────────────────────
   Tailwind v4 equivalent — put this in resources/css/app.css instead:

   @import "tailwindcss";

   @theme {
       --breakpoint-sm:  36rem;
       --breakpoint-md:  48rem;
       --breakpoint-lg:  62rem;
       --breakpoint-xl:  75rem;
       --breakpoint-2xl: 87.5rem;
       --breakpoint-3xl: 100rem;

       --text-fluid-base: clamp(1rem, 0.95rem + 0.25vw, 1.125rem);
       --text-fluid-xl:   clamp(1.5rem, 1.3rem + 1vw, 2rem);

       --spacing-touch: 2.75rem;
   }

   @custom-variant short (@media (max-height: 30rem));
   @custom-variant hover-hover (@media (hover: hover) and (pointer: fine));
   ───────────────────────────────────────────────────────────────────────────── */
