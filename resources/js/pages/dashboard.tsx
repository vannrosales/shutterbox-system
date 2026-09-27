import { Head, Link } from '@inertiajs/react';
import AppLayout from '@/layouts/app-layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
    Calendar, 
    Clock, 
    DollarSign, 
    Image as ImageIcon, 
    MapPin, 
    Printer, 
    Sparkles, 
    Ticket, 
    TrendingUp, 
    Users 
} from 'lucide-react';
import type { BreadcrumbItem } from '@/types';

interface MetricData {
    today_gross_sales: number;
    today_sessions: number;
    today_photostrips: number;
    waiting_queue: number;
    in_booth_queue: number;
}

interface BoothLocation {
    id: number;
    name: string;
    address: string;
    city: string;
    start_date: string;
    end_date: string;
    status: string;
}

interface Template {
    id: number;
    name: string;
    code: string;
    category: string;
    queue_sessions_count?: number;
}

interface QueueSession {
    id: number;
    queue_number: string;
    customer_name: string;
    sessions_count: number;
    total_photostrips: number;
    total_price: number;
    status: string;
    payment_method: string;
    created_at: string;
    templates: Template[];
}

interface Booking {
    id: number;
    booking_number: string;
    client_name: string;
    event_name: string;
    event_date: string;
    start_time: string;
    end_time: string;
    total_amount: number;
    status: string;
}

interface Props {
    metrics: MetricData;
    activeBooth: BoothLocation | null;
    topTemplate: Template | null;
    recentSessions: QueueSession[];
    upcomingBookings: Booking[];
}

const breadcrumbs: BreadcrumbItem[] = [
    {
        title: 'Dashboard',
        href: '/dashboard',
    },
];

export default function Dashboard({ metrics, activeBooth, topTemplate, recentSessions, upcomingBookings }: Props) {
    const formatCurrency = (val: number) => {
        return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(val);
    };

    return (
        <>
            <Head title="ShutterBox Overview" />

            <div className="flex flex-col gap-6 p-4 md:p-6">
                {/* Minimalist Hero Banner matching Creative Seven Brand Red */}
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-neutral-900 border border-neutral-800 p-6 md:p-8 rounded-2xl relative overflow-hidden shadow-sm">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-[#E50914]/10 rounded-full blur-3xl pointer-events-none" />

                    <div className="space-y-1.5 z-10">
                        <div className="flex items-center gap-2">
                            <span className="inline-block size-2 rounded-full bg-[#E50914] animate-pulse" />
                            <span className="text-xs font-mono uppercase tracking-widest text-[#E50914] font-bold">
                                ShutterBox POS Operating System
                            </span>
                        </div>
                        <h1 className="text-2xl md:text-3xl font-black tracking-tight text-white">
                            System Overview & POS Metrics
                        </h1>
                        <p className="text-sm text-neutral-400 max-w-xl">
                            Real-time session tracking, live booth queue status, daily gross revenue, and event calendar.
                        </p>
                    </div>

                    <div className="flex items-center gap-3 z-10 shrink-0">
                        <Button asChild className="bg-[#E50914] hover:bg-red-700 text-white font-bold px-5 shadow-md">
                            <Link href="/queuing">
                                <Ticket className="mr-2 size-4" />
                                Launch POS / Queuing
                            </Link>
                        </Button>
                        <Button asChild variant="outline" className="border-neutral-700 bg-neutral-800/80 text-white hover:bg-neutral-700">
                            <Link href="/calendar">
                                <Calendar className="mr-2 size-4" />
                                Add Booking
                            </Link>
                        </Button>
                    </div>
                </div>

                {/* Minimalist KPI Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <Card className="border-neutral-800 bg-neutral-900/60 backdrop-blur-xs">
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-xs font-mono uppercase tracking-wider text-neutral-400">
                                Daily Gross Sales
                            </CardTitle>
                            <DollarSign className="size-4 text-[#E50914]" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-extrabold font-mono text-white">
                                {formatCurrency(metrics.today_gross_sales)}
                            </div>
                            <p className="text-xs text-neutral-500 mt-1 flex items-center gap-1">
                                <TrendingUp className="size-3 text-[#E50914]" /> Live daily revenue
                            </p>
                        </CardContent>
                    </Card>

                    <Card className="border-neutral-800 bg-neutral-900/60 backdrop-blur-xs">
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-xs font-mono uppercase tracking-wider text-neutral-400">
                                Today's Sessions
                            </CardTitle>
                            <Printer className="size-4 text-[#E50914]" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold font-mono text-white">
                                {metrics.today_sessions} <span className="text-xs font-normal text-neutral-400">sessions</span>
                            </div>
                            <p className="text-xs text-neutral-500 mt-1">
                                {metrics.today_photostrips} photostrips printed today
                            </p>
                        </CardContent>
                    </Card>

                    <Card className="border-neutral-800 bg-neutral-900/60 backdrop-blur-xs">
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-xs font-mono uppercase tracking-wider text-neutral-400">
                                Live Queue Status
                            </CardTitle>
                            <Users className="size-4 text-[#E50914]" />
                        </CardHeader>
                        <CardContent>
                            <div className="flex items-baseline gap-2 font-mono">
                                <span className="text-2xl font-bold text-white">{metrics.waiting_queue}</span>
                                <span className="text-xs text-neutral-400">Waiting</span>
                                <span className="text-2xl font-bold text-[#E50914] ml-2">{metrics.in_booth_queue}</span>
                                <span className="text-xs text-neutral-400">In Booth</span>
                            </div>
                            <p className="text-xs text-neutral-500 mt-1">
                                Active customer queue count
                            </p>
                        </CardContent>
                    </Card>

                    <Card className="border-neutral-800 bg-neutral-900/60 backdrop-blur-xs">
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-xs font-mono uppercase tracking-wider text-neutral-400">
                                Best Template
                            </CardTitle>
                            <Sparkles className="size-4 text-[#E50914]" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-base font-bold text-white truncate">
                                {topTemplate ? topTemplate.name : 'N/A'}
                            </div>
                            <p className="text-xs text-neutral-500 mt-1 font-mono">
                                {topTemplate?.queue_sessions_count ?? 0} sessions selected
                            </p>
                        </CardContent>
                    </Card>
                </div>

                {/* Main Grid Section */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Left Column: Recent Activity & Bookings */}
                    <div className="lg:col-span-2 space-y-6">
                        {/* Live POS Activity */}
                        <Card className="border-neutral-800 bg-neutral-900/40">
                            <CardHeader className="flex flex-row items-center justify-between">
                                <div>
                                    <CardTitle className="text-base font-bold text-white">Recent POS Activity</CardTitle>
                                    <CardDescription>Walk-in photostrip queue logs</CardDescription>
                                </div>
                                <Button asChild variant="ghost" size="sm" className="text-xs text-[#E50914] hover:text-red-400 hover:bg-neutral-800">
                                    <Link href="/queuing">View Queue</Link>
                                </Button>
                            </CardHeader>
                            <CardContent>
                                {recentSessions.length === 0 ? (
                                    <p className="text-xs text-neutral-500 py-4 text-center">No queue sessions recorded today yet.</p>
                                ) : (
                                    <div className="divide-y divide-neutral-800/60">
                                        {recentSessions.map((session) => (
                                            <div key={session.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                                <div className="flex items-center gap-3">
                                                    <span className="font-mono text-xs font-bold px-2.5 py-1 rounded bg-black text-[#E50914] border border-neutral-800">
                                                        {session.queue_number}
                                                    </span>
                                                    <div>
                                                        <h4 className="text-sm font-semibold text-white">{session.customer_name}</h4>
                                                        <p className="text-xs text-neutral-400">
                                                            {session.sessions_count} session(s) • {session.total_photostrips} photostrips
                                                            {session.templates.length > 0 && ` • ${session.templates.map(t => t.name).join(', ')}`}
                                                        </p>
                                                    </div>
                                                </div>
                                                <div className="flex items-center justify-between sm:justify-end gap-3">
                                                    <span className="font-semibold text-sm font-mono text-white">{formatCurrency(session.total_price)}</span>
                                                    <Badge variant="outline" className="text-[10px] font-mono border-neutral-700 uppercase">
                                                        {session.status.replace('_', ' ')}
                                                    </Badge>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </CardContent>
                        </Card>

                        {/* Scheduled Bookings */}
                        <Card className="border-neutral-800 bg-neutral-900/40">
                            <CardHeader className="flex flex-row items-center justify-between">
                                <div>
                                    <CardTitle className="text-base font-bold text-white">Upcoming Bookings</CardTitle>
                                    <CardDescription>Scheduled private event reservations</CardDescription>
                                </div>
                                <Button asChild variant="ghost" size="sm" className="text-xs text-[#E50914] hover:text-red-400 hover:bg-neutral-800">
                                    <Link href="/calendar">View Calendar</Link>
                                </Button>
                            </CardHeader>
                            <CardContent>
                                {upcomingBookings.length === 0 ? (
                                    <p className="text-xs text-neutral-500 py-4 text-center">No upcoming bookings scheduled.</p>
                                ) : (
                                    <div className="space-y-2.5">
                                        {upcomingBookings.map((b) => (
                                            <div key={b.id} className="p-3.5 rounded-xl border border-neutral-800/80 bg-neutral-900/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                                <div className="space-y-1">
                                                    <div className="flex items-center gap-2">
                                                        <Badge variant="outline" className="text-[10px] font-mono border-neutral-700">{b.booking_number}</Badge>
                                                        <h4 className="font-semibold text-sm text-white">{b.event_name}</h4>
                                                    </div>
                                                    <p className="text-xs text-neutral-400 flex items-center gap-2">
                                                        <span><Users className="inline size-3 mr-1 text-neutral-500" /> {b.client_name}</span>
                                                        <span>•</span>
                                                        <span><Clock className="inline size-3 mr-1 text-neutral-500" /> {b.start_time} - {b.end_time}</span>
                                                    </p>
                                                </div>
                                                <div className="flex items-center justify-between sm:justify-end gap-3">
                                                    <div className="text-right">
                                                        <span className="text-xs text-neutral-500 block font-mono">{b.event_date}</span>
                                                        <span className="font-bold text-sm text-white font-mono">{formatCurrency(b.total_amount)}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </div>

                    {/* Right Column: Active Booth & Tools */}
                    <div className="space-y-6">
                        {/* Active Booth Station */}
                        <Card className="border-neutral-800 bg-neutral-900/80">
                            <CardHeader>
                                <CardTitle className="text-sm font-bold flex items-center gap-2 text-white">
                                    <MapPin className="size-4 text-[#E50914]" /> Active Booth Location
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                {activeBooth ? (
                                    <div className="space-y-2">
                                        <h3 className="font-bold text-base text-white">{activeBooth.name}</h3>
                                        <p className="text-xs text-neutral-400">{activeBooth.address}, {activeBooth.city}</p>
                                        <div className="pt-2">
                                            <Badge variant="outline" className="bg-[#E50914]/10 text-[#E50914] border-[#E50914]/30 text-[10px] font-mono font-bold">
                                                ACTIVE BOOTH STATION
                                            </Badge>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="text-center py-2">
                                        <p className="text-xs text-neutral-400 mb-3">No active booth location assigned.</p>
                                        <Button asChild size="sm" variant="outline" className="border-neutral-700 text-xs">
                                            <Link href="/calendar">Add Location</Link>
                                        </Button>
                                    </div>
                                )}
                            </CardContent>
                        </Card>

                        {/* Quick Action Navigation */}
                        <Card className="border-neutral-800 bg-neutral-900/40">
                            <CardHeader>
                                <CardTitle className="text-sm font-bold text-white">Quick Actions</CardTitle>
                            </CardHeader>
                            <CardContent className="grid grid-cols-1 gap-2">
                                <Button asChild variant="outline" className="justify-start h-auto py-3 px-4 border-neutral-800 bg-neutral-900/80 hover:bg-neutral-800">
                                    <Link href="/queuing">
                                        <Ticket className="mr-3 size-4 text-[#E50914]" />
                                        <div className="text-left">
                                            <div className="font-semibold text-xs text-white">Queuing & POS</div>
                                            <div className="text-[11px] text-neutral-400">Process walk-in photostrip sessions</div>
                                        </div>
                                    </Link>
                                </Button>

                                <Button asChild variant="outline" className="justify-start h-auto py-3 px-4 border-neutral-800 bg-neutral-900/80 hover:bg-neutral-800">
                                    <Link href="/calendar">
                                        <Calendar className="mr-3 size-4 text-[#E50914]" />
                                        <div className="text-left">
                                            <div className="font-semibold text-xs text-white">Calendar & Bookings</div>
                                            <div className="text-[11px] text-neutral-400">Manage event schedules and booths</div>
                                        </div>
                                    </Link>
                                </Button>

                                <Button asChild variant="outline" className="justify-start h-auto py-3 px-4 border-neutral-800 bg-neutral-900/80 hover:bg-neutral-800">
                                    <Link href="/financials">
                                        <DollarSign className="mr-3 size-4 text-[#E50914]" />
                                        <div className="text-left">
                                            <div className="font-semibold text-xs text-white">Financial Tracker & Sales</div>
                                            <div className="text-[11px] text-neutral-400">Daily gross sales & expenses log</div>
                                        </div>
                                    </Link>
                                </Button>

                                <Button asChild variant="outline" className="justify-start h-auto py-3 px-4 border-neutral-800 bg-neutral-900/80 hover:bg-neutral-800">
                                    <Link href="/templates">
                                        <ImageIcon className="mr-3 size-4 text-[#E50914]" />
                                        <div className="text-left">
                                            <div className="font-semibold text-xs text-white">Template Reports</div>
                                            <div className="text-[11px] text-neutral-400">Analyze top performing templates</div>
                                        </div>
                                    </Link>
                                </Button>

                                <Button
                                    variant="outline"
                                    onClick={() => {
                                        localStorage.removeItem('shutterbox_setup_completed');
                                        window.location.reload();
                                    }}
                                    className="justify-start h-auto py-3 px-4 border-neutral-800 bg-neutral-900/80 hover:bg-neutral-800 cursor-pointer"
                                >
                                    <Sparkles className="mr-3 size-4 text-[#E50914]" />
                                    <div className="text-left">
                                        <div className="font-semibold text-xs text-white">Event Revenue Import Wizard</div>
                                        <div className="text-[11px] text-neutral-400">Initialize or import existing event revenue</div>
                                    </div>
                                </Button>
                            </CardContent>
                        </Card>
                    </div>
                </div>
            </div>
        </>
    );
}

Dashboard.layout = (page: React.ReactNode) => <AppLayout breadcrumbs={breadcrumbs}>{page}</AppLayout>;
