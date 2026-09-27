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
        }, 1800);

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
                    className={`fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-black text-white select-none transition-opacity duration-500 ease-in-out ${
                        isSplashExiting ? 'opacity-0 pointer-events-none' : 'opacity-100'
                    }`}
                >
                    <div
                        className={`relative z-10 flex flex-col items-center px-4 transition-all duration-700 ease-out ${
                            isSplashExiting ? 'scale-105 opacity-0' : 'scale-100 opacity-100'
                        }`}
                    >
                        <CreativeSevenLogo variant="image" size="lg" className="w-64 sm:w-80 md:w-96 h-auto" />
                    </div>

                    <div
                        className={`absolute bottom-12 left-1/2 -translate-x-1/2 flex items-center space-x-2 z-10 transition-opacity duration-300 ${
                            isSplashExiting ? 'opacity-0' : 'opacity-100'
                        }`}
                        aria-hidden="true"
                    >
                        <span className="w-2 h-2 rounded-full bg-neutral-400 animate-pulse" style={{ animationDelay: '0ms' }} />
                        <span className="w-2 h-2 rounded-full bg-neutral-400 animate-pulse" style={{ animationDelay: '250ms' }} />
                        <span className="w-2 h-2 rounded-full bg-neutral-400 animate-pulse" style={{ animationDelay: '500ms' }} />
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
