import { useEffect, useState } from 'react';
import { Head, router } from '@inertiajs/react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
    Clock, 
    FastForward, 
    Maximize2, 
    Minimize2, 
    Sparkles, 
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
    const [prevQueueNumber, setPrevQueueNumber] = useState<string | null>(null);
    const [isChanging, setIsChanging] = useState(false);

    // Auto background poll every 3 seconds for real-time monitor sync
    useEffect(() => {
        const interval = setInterval(() => {
            router.reload();
        }, 3000);

        return () => clearInterval(interval);
    }, []);

    const playChime = () => {
        if (isMuted) return;
        try {
            const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
            if (!AudioCtx) return;
            const ctx = new AudioCtx();
            const now = ctx.currentTime;
            
            // First chime tone (D5)
            const osc1 = ctx.createOscillator();
            const gain1 = ctx.createGain();
            osc1.type = 'sine';
            osc1.frequency.setValueAtTime(587.33, now);
            gain1.gain.setValueAtTime(0.3, now);
            gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
            osc1.connect(gain1);
            gain1.connect(ctx.destination);
            osc1.start(now);
            osc1.stop(now + 0.5);

            // Second chime tone (A5)
            const osc2 = ctx.createOscillator();
            const gain2 = ctx.createGain();
            osc2.type = 'sine';
            osc2.frequency.setValueAtTime(880, now + 0.15);
            gain2.gain.setValueAtTime(0.4, now + 0.15);
            gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.75);
            osc2.connect(gain2);
            gain2.connect(ctx.destination);
            osc2.start(now + 0.15);
            osc2.stop(now + 0.75);
        } catch {
            // Audio context blocked by autoplay policy until user gesture
        }
    };

    const waitingSessions = sessions.filter((s) => s.status === 'waiting');
    const nowServingSession = sessions.find((s) => s.status === 'in_booth') || waitingSessions[0];
    const nextInLineSessions = nowServingSession && nowServingSession.status === 'waiting' 
        ? waitingSessions.slice(1) 
        : waitingSessions;

    const skippedSessions = sessions.filter((s) => s.status === 'skipped');

    // Trigger animation when nowServingSession changes
    useEffect(() => {
        if (nowServingSession?.queue_number) {
            if (prevQueueNumber !== null && prevQueueNumber !== nowServingSession.queue_number) {
                setIsChanging(true);
                playChime();
                const timer = setTimeout(() => setIsChanging(false), 1500);
                return () => clearTimeout(timer);
            }
            setPrevQueueNumber(nowServingSession.queue_number);
        }
    }, [nowServingSession?.queue_number]);

    const toggleFullscreen = () => {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
        } else {
            if (document.exitFullscreen) {
                document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
            }
        }
    };

    return (
        <>
            <Head title="Live Queue Monitor - ShutterBox POS" />

            <div className="min-h-screen bg-[#0a0a0a] text-white flex flex-col justify-center p-4 md:p-6 lg:p-8 select-none overflow-hidden relative font-sans">
                {/* Background Ambient Glow */}
                <div className={`absolute top-1/4 left-1/3 w-[600px] h-[600px] rounded-full blur-[160px] pointer-events-none transition-all duration-1000 ${
                    isChanging ? 'bg-emerald-500/20 scale-125' : 'bg-[#E50914]/10 scale-100'
                }`} />

                {/* Floating Subtle Screen Controls */}
                <div className="absolute top-4 right-4 z-50 flex items-center gap-2 opacity-20 hover:opacity-100 transition-opacity">
                    <Button
                        variant="outline"
                        size="icon"
                        onClick={() => setIsMuted(!isMuted)}
                        className="size-8 border-neutral-800 bg-neutral-900/80 text-neutral-400 hover:text-white"
                        title={isMuted ? 'Unmute Sound' : 'Mute Sound'}
                    >
                        {isMuted ? <VolumeX className="size-4" /> : <Volume2 className="size-4 text-[#E50914]" />}
                    </Button>
                    <Button
                        variant="outline"
                        size="icon"
                        onClick={toggleFullscreen}
                        className="size-8 border-neutral-800 bg-neutral-900/80 text-neutral-400 hover:text-white"
                        title="Toggle Fullscreen"
                    >
                        {isFullscreen ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
                    </Button>
                </div>

                {/* Main Monitor Display Cards */}
                <main className="grid grid-cols-1 lg:grid-cols-12 gap-6 w-full max-w-[1920px] mx-auto flex-1 items-stretch z-10 py-2">
                    {/* Left Panel Card: Live Queue Session */}
                    <div className={`lg:col-span-7 bg-[#121212] border rounded-3xl p-6 md:p-10 flex flex-col justify-between relative overflow-hidden shadow-2xl transition-all duration-700 ${
                        isChanging ? 'border-emerald-500/80 ring-4 ring-emerald-500/20 bg-emerald-950/20' : 'border-neutral-800/80'
                    }`}>
                        {isChanging && (
                            <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-emerald-500 text-black font-black text-xs md:text-sm px-6 py-2 rounded-full shadow-lg shadow-emerald-500/50 uppercase tracking-widest animate-bounce z-20 flex items-center gap-2">
                                <Sparkles className="size-4 animate-spin" /> NOW SERVING TICKET #{nowServingSession?.queue_number}!
                            </div>
                        )}

                        <div className="flex items-center justify-between z-10">
                            <span className="text-xs md:text-sm font-extrabold uppercase tracking-[0.3em] text-[#E50914] flex items-center gap-2">
                                <span className="relative flex h-3 w-3">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#E50914] opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-3 w-3 bg-[#E50914]"></span>
                                </span>
                                LIVE SESSION
                            </span>
                            <Badge variant="outline" className={`px-3 py-1 text-xs font-mono transition-colors duration-500 ${
                                isChanging ? 'bg-emerald-500 text-black font-bold border-emerald-500' : 'bg-[#E50914]/10 text-[#E50914] border-[#E50914]/30'
                            }`}>
                                {isChanging ? 'NOW SERVING NEXT!' : 'Now Serving / Next Customer'}
                            </Badge>
                        </div>

                        {nowServingSession ? (
                            <div className="my-auto py-8 flex flex-col items-center justify-center text-center">
                                <div className={`font-mono text-7xl sm:text-8xl md:text-9xl font-black tracking-tighter bg-neutral-950 border-2 px-8 md:px-14 py-6 md:py-8 rounded-3xl transition-all duration-700 transform ${
                                    isChanging 
                                        ? 'scale-110 border-emerald-400 text-emerald-300 shadow-[0_0_80px_rgba(16,185,129,0.8)] animate-pulse' 
                                        : 'scale-100 border-[#E50914]/80 text-white drop-shadow-[0_10px_30px_rgba(229,9,20,0.3)] animate-pulse'
                                }`}>
                                    {nowServingSession.queue_number}
                                </div>
                                <h2 className="text-3xl md:text-5xl font-extrabold text-neutral-100 mt-6 tracking-tight transition-all duration-500">
                                    {nowServingSession.customer_name}
                                </h2>
                                {nowServingSession.templates && nowServingSession.templates.length > 0 && (
                                    <div className="flex flex-wrap items-center justify-center gap-2 mt-4">
                                        {nowServingSession.templates.map((tpl) => (
                                            <Badge key={tpl.id} variant="secondary" className="bg-neutral-800/80 text-neutral-300 border-neutral-700 text-xs px-3 py-1">
                                                <Sparkles className="mr-1 size-3 text-[#E50914]" /> {tpl.name}
                                            </Badge>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="my-auto text-center py-16">
                                <UserCheck className="size-20 text-neutral-700 mx-auto mb-4" />
                                <h3 className="text-2xl md:text-3xl font-bold text-neutral-300">Booth Ready</h3>
                                <p className="text-sm text-neutral-500 mt-1">Waiting for next customer in queue...</p>
                            </div>
                        )}
                    </div>

                    {/* Right Panel Card: Next in Line & Skipped Queue */}
                    <div className="lg:col-span-5 flex flex-col gap-6 justify-between h-full">
                        {/* Next in Line Card */}
                        <div className="bg-[#121212] border border-neutral-800/80 rounded-3xl p-6 md:p-8 flex-1 flex flex-col justify-between shadow-2xl">
                            <div className="flex items-center justify-between border-b border-neutral-800/60 pb-4 mb-4">
                                <span className="text-xs md:text-sm font-bold uppercase tracking-wider text-neutral-300 flex items-center gap-2">
                                    <Clock className="size-4 text-blue-500" /> NEXT IN LINE ({nextInLineSessions.length})
                                </span>
                                <span className="text-[11px] font-mono text-neutral-500 tracking-wider">UPCOMING QUEUE</span>
                            </div>

                            {nextInLineSessions.length === 0 ? (
                                <div className="my-auto text-center py-12 text-neutral-500 text-sm">
                                    No additional customers waiting in line.
                                </div>
                            ) : (
                                <div className="grid grid-cols-2 gap-3.5 overflow-y-auto max-h-[380px] pr-1 my-auto">
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
                            <div className="bg-amber-500/10 border border-amber-500/30 rounded-3xl p-5 backdrop-blur-md">
                                <div className="flex items-center gap-2 text-amber-400 text-xs font-bold uppercase tracking-wider mb-2.5">
                                    <FastForward className="size-4" /> SKIPPED TICKETS ({skippedSessions.length})
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    {skippedSessions.map((s) => (
                                        <Badge key={s.id} variant="outline" className="bg-neutral-950/90 border-amber-500/40 text-amber-300 font-mono text-sm px-3 py-1">
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
