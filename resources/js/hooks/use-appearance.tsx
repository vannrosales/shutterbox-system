import { useSyncExternalStore } from 'react';

export type ResolvedAppearance = 'dark';
export type Appearance = 'light' | 'dark' | 'system';

export type UseAppearanceReturn = {
    readonly appearance: Appearance;
    readonly resolvedAppearance: ResolvedAppearance;
    readonly updateAppearance: (mode: Appearance) => void;
};

const listeners = new Set<() => void>();
let currentAppearance: Appearance = 'dark';

const setCookie = (name: string, value: string, days = 365): void => {
    if (typeof document === 'undefined') {
        return;
    }

    const maxAge = days * 24 * 60 * 60;
    document.cookie = `${name}=${value};path=/;max-age=${maxAge};SameSite=Lax`;
};

const applyTheme = (appearance: Appearance): void => {
    if (typeof document === 'undefined') {
        return;
    }

    document.documentElement.classList.add('dark');
    document.documentElement.style.colorScheme = 'dark';
};

const subscribe = (callback: () => void) => {
    listeners.add(callback);

    return () => listeners.delete(callback);
};

const notify = (): void => listeners.forEach((listener) => listener());

export function initializeTheme(): void {
    if (typeof window === 'undefined') {
        return;
    }

    localStorage.setItem('appearance', 'dark');
    setCookie('appearance', 'dark');

    currentAppearance = 'dark';
    applyTheme('dark');
}

export function useAppearance(): UseAppearanceReturn {
    const appearance: Appearance = useSyncExternalStore(
        subscribe,
        () => currentAppearance,
        () => 'dark',
    );

    const resolvedAppearance: ResolvedAppearance = 'dark';

    const updateAppearance = (mode: Appearance): void => {
        currentAppearance = 'dark';
        localStorage.setItem('appearance', 'dark');
        setCookie('appearance', 'dark');
        applyTheme('dark');
        notify();
    };

    return { appearance, resolvedAppearance, updateAppearance } as const;
}
