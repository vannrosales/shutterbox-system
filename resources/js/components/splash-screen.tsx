import React, { useEffect, useState } from 'react';
import CreativeSevenLogo from '@/components/creative-seven-logo';

export interface SplashScreenProps {
    onComplete?: () => void;
    duration?: number;
    autoDismiss?: boolean;
    showSkip?: boolean;
}

export default function SplashScreen({
    onComplete,
    duration = 2400,
    autoDismiss = true,
    showSkip = false,
}: SplashScreenProps) {
    const [isExiting, setIsExiting] = useState(false);
    const [isDone, setIsDone] = useState(false);

    useEffect(() => {
        let dismissTimer: NodeJS.Timeout | null = null;
        if (autoDismiss) {
            dismissTimer = setTimeout(() => {
                handleExit();
            }, duration);
        }

        return () => {
            if (dismissTimer) clearTimeout(dismissTimer);
        };
    }, [duration, autoDismiss]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && showSkip) {
                handleExit();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [showSkip]);

    const handleExit = () => {
        if (isExiting) return;
        setIsExiting(true);

        setTimeout(() => {
            setIsDone(true);
            if (onComplete) {
                onComplete();
            }
        }, 500);
    };

    if (isDone) {
        return null;
    }

    return (
        <div
            role="dialog"
            aria-label="Application splash screen"
            aria-busy={!isExiting}
            tabIndex={-1}
            className={`fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-black text-white select-none transition-opacity duration-500 ease-in-out ${
                isExiting ? 'opacity-0 scale-105 pointer-events-none' : 'opacity-100 scale-100'
            }`}
        >
            {showSkip && (
                <button
                    onClick={handleExit}
                    className="absolute top-6 right-6 px-4 py-1.5 rounded-full text-xs uppercase font-medium tracking-wider text-neutral-400 border border-neutral-800 hover:border-neutral-600 hover:text-white transition-all z-20"
                >
                    Skip <span className="text-neutral-600 ml-1 font-mono">(Esc)</span>
                </button>
            )}

            {/* Centered Logo with smooth scale and fade transition */}
            <div
                className={`relative z-10 flex flex-col items-center px-4 transition-all duration-700 ease-out ${
                    isExiting ? 'scale-105 opacity-0' : 'scale-100 opacity-100'
                }`}
            >
                <CreativeSevenLogo variant="image" size="lg" className="w-64 sm:w-80 md:w-96 h-auto" />
            </div>

            {/* Waray-Flix Style Bottom 3-Dot Loading Wave */}
            <div
                className={`absolute bottom-12 left-1/2 -translate-x-1/2 flex items-center space-x-2 z-10 transition-opacity duration-300 ${
                    isExiting ? 'opacity-0' : 'opacity-100'
                }`}
                aria-hidden="true"
            >
                <span className="w-2 h-2 rounded-full bg-neutral-400 animate-pulse" style={{ animationDelay: '0ms' }} />
                <span className="w-2 h-2 rounded-full bg-neutral-400 animate-pulse" style={{ animationDelay: '250ms' }} />
                <span className="w-2 h-2 rounded-full bg-neutral-400 animate-pulse" style={{ animationDelay: '500ms' }} />
            </div>
        </div>
    );
}

