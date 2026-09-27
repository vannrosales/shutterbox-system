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
            className={`fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-black text-white select-none transition-opacity duration-700 ease-in-out ${
                isExiting ? 'opacity-0 pointer-events-none' : 'opacity-100'
            }`}
        >
            {/* Minimalist Ambient Radial Glow */}
            <div
                className="absolute w-96 h-96 rounded-full bg-[#E50914]/15 blur-3xl pointer-events-none animate-pulse transition-opacity duration-1000"
                style={{ animationDuration: '2.5s' }}
            />

            {/* Minimalist Aperture Orbit Ring */}
            <div className="absolute w-72 sm:w-96 md:w-[440px] h-72 sm:h-96 md:h-[440px] rounded-full border border-neutral-900 border-t-neutral-700/40 animate-[spin_15s_linear_infinite] pointer-events-none" />

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
                    isExiting ? 'scale-105 opacity-0 blur-sm' : 'scale-100 opacity-100 blur-none'
                }`}
            >
                <CreativeSevenLogo variant="image" size="lg" glow={true} className="w-64 sm:w-80 md:w-96 h-auto" />
            </div>

            {/* Minimalist Sleek Progress Indicator */}
            <div
                className={`absolute bottom-14 flex flex-col items-center gap-2.5 z-10 transition-all duration-500 ${
                    isExiting ? 'opacity-0 translate-y-2' : 'opacity-100 translate-y-0'
                }`}
                aria-hidden="true"
            >
                {/* Sleek 2px progress bar track */}
                <div className="w-36 h-[2px] bg-neutral-900 rounded-full overflow-hidden relative">
                    <div className="absolute top-0 bottom-0 left-0 bg-[#E50914] w-full rounded-full animate-pulse" />
                </div>

                <span className="text-[10px] font-mono font-medium tracking-[0.35em] text-neutral-500 uppercase">
                    ShutterBox POS
                </span>
            </div>
        </div>
    );
}
