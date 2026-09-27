import React, { useEffect, useState } from 'react';
import CreativeSevenLogo from '@/components/creative-seven-logo';

interface AppSplashProviderProps {
    children: React.ReactNode;
}

export default function AppSplashProvider({ children }: AppSplashProviderProps) {
    const [isExiting, setIsExiting] = useState(false);
    const [isMounted, setIsMounted] = useState(true);

    useEffect(() => {
        // Waray-Flix style fast desktop/web app launch sequence
        const exitTimer = setTimeout(() => {
            setIsExiting(true);
        }, 1800);

        const unmountTimer = setTimeout(() => {
            setIsMounted(false);
        }, 2300);

        return () => {
            clearTimeout(exitTimer);
            clearTimeout(unmountTimer);
        };
    }, []);

    return (
        <>
            {/* Main Application Interface */}
            {children}

            {/* Waray-Flix Style Desktop App Launch Splash Overlay */}
            {isMounted && (
                <div
                    role="dialog"
                    aria-label="App Launching"
                    className={`fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-black text-white select-none transition-opacity duration-500 ease-in-out ${
                        isExiting ? 'opacity-0 pointer-events-none' : 'opacity-100'
                    }`}
                >
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
            )}
        </>
    );
}

