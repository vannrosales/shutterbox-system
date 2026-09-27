/**
 * Focus trap for dialogs that cannot use native <dialog>.showModal().
 *
 * Prefer <dialog> + showModal(): it gives focus trapping, Escape, the top layer,
 * background inertness, and focus restoration for free. Use this only when the
 * native element is not an option.
 *
 * Satisfies: SC 2.1.2 (No Keyboard Trap — Escape always exits),
 *            SC 2.4.3 (Focus Order), SC 4.1.2 (Name, Role, Value).
 */

const FOCUSABLE = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled]):not([type="hidden"])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
    'details > summary',
    'audio[controls]',
    'video[controls]',
    '[contenteditable]:not([contenteditable="false"])',
].join(',');

export class FocusTrap {
    /**
     * @param {HTMLElement} container
     * @param {{ initialFocus?: HTMLElement, onEscape?: () => void }} options
     */
    constructor(container, options = {}) {
        this.container = container;
        this.options = options;
        this.previouslyFocused = null;
        this.handleKeydown = this.handleKeydown.bind(this);
    }

    /** Visible + focusable, in DOM order. Recomputed on every Tab so dynamic content works. */
    get focusable() {
        return Array.from(this.container.querySelectorAll(FOCUSABLE)).filter((el) => {
            if (el.hasAttribute('inert') || el.closest('[inert]')) return false;
            if (el.getAttribute('aria-hidden') === 'true') return false;
            const style = window.getComputedStyle(el);
            if (style.display === 'none' || style.visibility === 'hidden') return false;
            return el.offsetWidth > 0 || el.offsetHeight > 0 || el.getClientRects().length > 0;
        });
    }

    activate() {
        this.previouslyFocused = document.activeElement;

        // Make the rest of the page inert so AT virtual cursors cannot escape either.
        Array.from(document.body.children).forEach((child) => {
            if (child !== this.container && !child.contains(this.container)) {
                child.setAttribute('inert', '');
                child.dataset.a11yInerted = 'true';
            }
        });

        document.addEventListener('keydown', this.handleKeydown, true);
        document.body.style.overflow = 'hidden';

        // Focus the dialog itself (needs tabindex="-1") so the accessible name is
        // announced before the first control. Falls back to the first focusable.
        const target = this.options.initialFocus
            ?? (this.container.hasAttribute('tabindex') ? this.container : this.focusable[0]);

        target?.focus();
    }

    deactivate() {
        document.removeEventListener('keydown', this.handleKeydown, true);
        document.body.style.overflow = '';

        document.querySelectorAll('[data-a11y-inerted]').forEach((el) => {
            el.removeAttribute('inert');
            delete el.dataset.a11yInerted;
        });

        // SC 2.4.3: focus must return to whatever opened the dialog.
        this.previouslyFocused?.focus();
        this.previouslyFocused = null;
    }

    handleKeydown(event) {
        if (event.key === 'Escape') {
            event.preventDefault();
            this.options.onEscape?.();
            return;
        }

        if (event.key !== 'Tab') return;

        const focusable = this.focusable;
        if (focusable.length === 0) {
            event.preventDefault();
            return;
        }

        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        const active = document.activeElement;

        if (event.shiftKey && (active === first || !this.container.contains(active))) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && active === last) {
            event.preventDefault();
            first.focus();
        }
    }
}

/* ── Usage ──────────────────────────────────────────────────────────────────

<button type="button" id="open">Delete invoice</button>

<div id="dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title"
     tabindex="-1" hidden>
    <h2 id="dialog-title">Delete this invoice?</h2>
    ...
</div>

import { FocusTrap } from './focus-trap.js';

const dialog = document.getElementById('dialog');
const trap = new FocusTrap(dialog, { onEscape: close });

function open()  { dialog.hidden = false; trap.activate(); }
function close() { trap.deactivate(); dialog.hidden = true; }

document.getElementById('open').addEventListener('click', open);

─────────────────────────────────────────────────────────────────────────────── */

/**
 * SPA route-change announcer.
 *
 * Livewire wire:navigate and Inertia visits swap the page without a document load,
 * so focus stays where it was and nothing is announced. Fix both.
 */
export function announceRouteChange(title) {
    const main = document.getElementById('main');
    main?.focus();                       // needs tabindex="-1" on <main>

    let region = document.getElementById('route-announcer');
    if (!region) {
        region = document.createElement('div');
        region.id = 'route-announcer';
        region.setAttribute('role', 'status');
        region.setAttribute('aria-live', 'polite');
        region.className = 'sr-only';
        document.body.appendChild(region);
    }

    // Clear first: identical consecutive text is not re-announced.
    region.textContent = '';
    setTimeout(() => { region.textContent = title ?? document.title; }, 100);
}

// Livewire:  document.addEventListener('livewire:navigated', () => announceRouteChange());
// Inertia:   router.on('navigate', () => announceRouteChange());
