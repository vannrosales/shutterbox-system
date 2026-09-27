import React, { useEffect, useState } from 'react';
import CreativeSevenLogo from '@/components/creative-seven-logo';
import FirstTimeSetupModal, { SetupData } from '@/components/first-time-setup-modal';
import { router } from '@inertiajs/react';
import { toast } from 'sonner';

interface AppSplashProviderProps {
    children: React.ReactNode;
}

export default function AppSplashProvider({ children }: AppSplashProviderProps) {
    const [isSplashExiting, setIsSplashExiting] = useState(false);
    const [isSplashMounted, setIsSplashMounted] = useState(true);
    const [showSetupModal, setShowSetupModal] = useState(false);

    useEffect(() => {
        // Fast desktop launch splash
        const exitTimer = setTimeout(() => {
            setIsSplashExiting(true);
        }, 1400);

        const unmountTimer = setTimeout(() => {
            setIsSplashMounted(false);
            // Check if first time opening app
            const hasCompletedSetup = localStorage.getItem('shutterbox_setup_completed');
            if (!hasCompletedSetup) {
                setShowSetupModal(true);
            }
        }, 2000);

        return () => {
            clearTimeout(exitTimer);
            clearTimeout(unmountTimer);
        };
    }, []);

    const handleSetupComplete = (data: SetupData) => {
        localStorage.setItem('shutterbox_setup_completed', 'true');
        localStorage.setItem('shutterbox_event_setup', JSON.stringify(data));
        setShowSetupModal(false);

        const formattedRev = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(data.totalRevenue);
        toast.success(`Event revenue initialized for "${data.eventName}"! Total Revenue: ${formattedRev}`);

        // Automatically register location in booth calendar if available
        try {
            router.post(
                '/calendar/booths',
                {
                    name: data.eventName,
                    start_date: data.dateFrom,
                    end_date: data.dateTo,
                    address: 'Main Event Venue',
                    city: 'Event Location',
                    notes: `Existing event revenue: ${formattedRev}`,
                },
                {
                    preserveScroll: true,
                    onError: () => {}, // silent fallback if backend route requires auth/diff context
                }
            );
        } catch {
            // Ignore error if router not ready
        }
    };

    return (
        <>
            {/* Main Application */}
            {children}

            {/* App Launch Splash Overlay */}
            {isSplashMounted && (
                <div
                    role="dialog"
                    aria-label="App Launching"
                    className={`fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-black text-white select-none transition-opacity duration-700 ease-in-out ${
                        isSplashExiting ? 'opacity-0 pointer-events-none' : 'opacity-100'
                    }`}
                >
                    {/* Minimalist Ambient Radial Glow */}
                    <div
                        className="absolute w-96 h-96 rounded-full bg-[#E50914]/15 blur-3xl pointer-events-none animate-pulse transition-opacity duration-1000"
                        style={{ animationDuration: '2.5s' }}
                    />

                    {/* Minimalist Aperture Orbit Ring */}
                    <div className="absolute w-72 sm:w-96 md:w-[440px] h-72 sm:h-96 md:h-[440px] rounded-full border border-neutral-900 border-t-neutral-700/40 animate-[spin_15s_linear_infinite] pointer-events-none" />

                    {/* Centered Logo with smooth entry and exit transitions */}
                    <div
                        className={`relative z-10 flex flex-col items-center px-4 transition-all duration-700 ease-out ${
                            isSplashExiting ? 'scale-105 opacity-0 blur-sm' : 'scale-100 opacity-100 blur-none'
                        }`}
                    >
                        <CreativeSevenLogo variant="image" size="lg" glow={true} className="w-64 sm:w-80 md:w-96 h-auto" />
                    </div>

                    {/* Minimalist Sleek Loading Progress Indicator */}
                    <div
                        className={`absolute bottom-14 flex flex-col items-center gap-2.5 z-10 transition-all duration-500 ${
                            isSplashExiting ? 'opacity-0 translate-y-2' : 'opacity-100 translate-y-0'
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
            )}

            {/* First-Time App Setup & Revenue Modal */}
            <FirstTimeSetupModal
                isOpen={showSetupModal}
                onComplete={handleSetupComplete}
            />
        </>
    );
}
