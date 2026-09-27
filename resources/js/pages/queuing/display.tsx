import { useEffect, useState } from 'react';
import { Head, router } from '@inertiajs/react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import AppLayout from '@/layouts/app-layout';
import { 
    Clock, 
    FastForward, 
    Maximize2, 
    Minimize2, 
    Sparkles, 
    Ticket, 
    UserCheck, 
    Volume2, 
    VolumeX 
} from 'lucide-react';

interface Template {
    id: number;
    name: string;
    code: string;
    category: string;
}

interface BoothLocation {
    id: number;
    name: string;
    city: string;
}

interface QueueSession {
    id: number;
    queue_number: string;
    customer_name: string;
    sessions_count: number;
    total_photostrips: number;
    status: string;
    created_at: string;
    templates: Template[];
    booth_location?: BoothLocation;
}

interface Props {
    sessions: QueueSession[];
    activeBooth?: BoothLocation | null;
}

export default function QueueDisplay({ sessions, activeBooth }: Props) {
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [isMuted, setIsMuted] = useState(false);

    // Auto background poll every 3 seconds for real-time monitor sync
    useEffect(() => {
        const interval = setInterval(() => {
            router.reload();
        }, 3000);

        return () => clearInterval(interval);
    }, []);

    const toggleFullscreen = () => {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
        } else {
            if (document.exitFullscreen) {
                document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
            }
        }
    };

    const waitingSessions = sessions.filter((s) => s.status === 'waiting');
    const nowServingSession = sessions.find((s) => s.status === 'in_booth') || waitingSessions[0];
    const nextInLineSessions = nowServingSession && nowServingSession.status === 'waiting' 
        ? waitingSessions.slice(1) 
        : waitingSessions;

    const skippedSessions = sessions.filter((s) => s.status === 'skipped');
    const completedSessions = sessions.filter((s) => s.status === 'completed').slice(-4);

    return (
        <>
            <Head title="Live Queue Monitor - ShutterBox POS" />

            <div className="min-h-screen bg-black text-white flex flex-col justify-between p-6 md:p-10 select-none overflow-hidden relative font-sans">
                {/* Background Ambient Glow */}
                <div className="absolute top-1/4 left-1/3 w-[600px] h-[600px] bg-[#E50914]/10 rounded-full blur-[140px] pointer-events-none" />

                {/* Top Header */}
                <header className="flex items-center justify-between border-b border-neutral-800/80 pb-6 z-10">
                    <div className="flex items-center gap-4">
                        <div className="bg-[#E50914] p-3 rounded-2xl shadow-lg shadow-[#E50914]/20">
                            <Ticket className="size-8 text-white" />
                        </div>
                        <div>
                            <h1 className="text-2xl md:text-3xl font-black tracking-tight flex items-center gap-2">
                                SHUTTERBOX <span className="text-[#E50914] font-normal">POS</span>
                            </h1>
                            <p className="text-xs md:text-sm text-neutral-400 font-mono tracking-wider">
                                LIVE PHOTOBOOTH QUEUE DISPLAY {activeBooth ? `• ${activeBooth.name}` : ''}
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        <Button
                            variant="outline"
                            size="icon"
                            onClick={() => setIsMuted(!isMuted)}
                            className="border-neutral-800 bg-neutral-900/80 text-neutral-300 hover:text-white"
                            title={isMuted ? 'Unmute Sound' : 'Mute Sound'}
                        >
                            {isMuted ? <VolumeX className="size-5" /> : <Volume2 className="size-5 text-[#E50914]" />}
                        </Button>
                        <Button
                            variant="outline"
                            size="icon"
                            onClick={toggleFullscreen}
                            className="border-neutral-800 bg-neutral-900/80 text-neutral-300 hover:text-white"
                            title="Toggle Fullscreen"
                        >
                            {isFullscreen ? <Minimize2 className="size-5" /> : <Maximize2 className="size-5" />}
                        </Button>
                    </div>
                </header>

                {/* Main Monitor Display Grid */}
                <main className="grid grid-cols-1 lg:grid-cols-12 gap-8 my-8 flex-1 items-stretch z-10">
                    {/* Left Panel: Currently Serving / Next Customer */}
                    <div className="lg:col-span-7 bg-neutral-900/70 border border-neutral-800/90 rounded-3xl p-8 md:p-12 flex flex-col justify-between relative overflow-hidden shadow-2xl backdrop-blur-md">
                        <div className="flex items-center justify-between">
                            <span className="text-xs md:text-sm font-extrabold uppercase tracking-[0.3em] text-[#E50914] flex items-center gap-2">
                                <span className="relative flex h-3 w-3">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#E50914] opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-3 w-3 bg-[#E50914]"></span>
                                </span>
                                LIVE SESSION
                            </span>
                            <Badge className="bg-[#E50914]/20 text-[#E50914] border-[#E50914]/40 px-3 py-1 text-xs font-mono">
                                Now Serving / Next Customer 
                            </Badge>
                        </div>

                        {nowServingSession ? (
                            <div className="my-8 flex flex-col items-center justify-center text-center">
                                <div className="font-mono text-7xl sm:text-8xl md:text-9xl font-black text-white tracking-tighter drop-shadow-[0_10px_20px_rgba(229,9,20,0.3)] bg-neutral-950 border-2 border-[#E50914] px-8 md:px-12 py-4 md:py-6 rounded-3xl animate-pulse">
                                    {nowServingSession.queue_number}
                                </div>
                                <h2 className="text-2xl md:text-4xl font-extrabold text-neutral-100 mt-6 tracking-tight">
                                    {nowServingSession.customer_name}
                                </h2>
                                <div className="flex flex-wrap items-center justify-center gap-2 mt-4">
                                    {nowServingSession.templates.map((tpl) => (
                                        <Badge key={tpl.id} variant="secondary" className="bg-neutral-800 text-neutral-300 border-neutral-700 text-xs px-3 py-1">
                                            <Sparkles className="mr-1 size-3 text-[#E50914]" /> {tpl.name}
                                        </Badge>
                                    ))}
                                </div>
                            </div>
                        ) : (
                            <div className="my-auto text-center py-16">
                                <UserCheck className="size-20 text-neutral-700 mx-auto mb-4" />
                                <h3 className="text-2xl font-bold text-neutral-400">Booth Ready</h3>
                                <p className="text-sm text-neutral-500 mt-1">Waiting for next customer in queue...</p>
                            </div>
                        )}
                    </div>

                    {/* Right Panel: Next in Line & Skipped Tickets */}
                    <div className="lg:col-span-5 flex flex-col gap-6 justify-between">
                        {/* Waiting Next in Line */}
                        <div className="bg-neutral-900/50 border border-neutral-800/80 rounded-3xl p-6 flex-1 flex flex-col justify-between backdrop-blur-sm">
                            <div className="flex items-center justify-between border-b border-neutral-800/60 pb-3 mb-4">
                                <span className="text-xs font-bold uppercase tracking-wider text-neutral-300 flex items-center gap-2">
                                    <Clock className="size-4 text-blue-500" /> Next in Line ({nextInLineSessions.length})
                                </span>
                                <span className="text-[11px] font-mono text-neutral-500">UPCOMING QUEUE</span>
                            </div>

                            {nextInLineSessions.length === 0 ? (
                                <div className="my-auto text-center py-8 text-neutral-500 text-sm">
                                    No additional customers waiting in line.
                                </div>
                            ) : (
                                <div className="grid grid-cols-2 gap-3 overflow-y-auto max-h-[300px] pr-1">
                                    {nextInLineSessions.slice(0, 6).map((session, idx) => (
                                        <div
                                            key={session.id}
                                            className={`p-4 rounded-2xl border flex flex-col justify-between transition-all ${
                                                idx === 0 
                                                    ? 'bg-blue-500/10 border-blue-500/40 text-blue-300 shadow-md' 
                                                    : 'bg-neutral-950/80 border-neutral-800 text-neutral-200'
                                            }`}
                                        >
                                            <div className="flex justify-between items-center">
                                                <span className="font-mono text-2xl md:text-3xl font-black">{session.queue_number}</span>
                                                {idx === 0 && <Badge className="bg-blue-500 text-white text-[9px] px-1.5 py-0">NEXT</Badge>}
                                            </div>
                                            <span className="text-xs font-semibold truncate mt-2 text-neutral-300">
                                                {session.customer_name}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {nextInLineSessions.length > 6 && (
                                <div className="pt-3 text-center text-xs font-mono text-neutral-500">
                                    +{nextInLineSessions.length - 6} more in line
                                </div>
                            )}
                        </div>

                        {/* Skipped Tickets Notice */}
                        {skippedSessions.length > 0 && (
                            <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4">
                                <div className="flex items-center gap-2 text-amber-400 text-xs font-bold uppercase tracking-wider mb-2">
                                    <FastForward className="size-4" /> Skipped Tickets ({skippedSessions.length})
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    {skippedSessions.map((s) => (
                                        <Badge key={s.id} variant="outline" className="bg-neutral-950 border-amber-500/40 text-amber-300 font-mono text-sm px-2.5 py-1">
                                            {s.queue_number} ({s.customer_name})
                                        </Badge>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </main>
            </div>
        </>
    );
}
