import { Head, Link } from '@inertiajs/react';
import AppLayout from '@/layouts/app-layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
    Calendar, 
    CheckCircle2, 
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
                {/* Header Banner */}
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-gradient-to-r from-neutral-900 to-neutral-800 text-white p-6 rounded-2xl shadow-lg border border-neutral-800">
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                            <Sparkles className="size-5 text-amber-400" />
                            <span className="text-xs uppercase tracking-widest text-amber-400 font-semibold">Photo Booth Operating System</span>
                        </div>
                        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">ShutterBox Dashboard</h1>
                        <p className="text-sm text-neutral-300 mt-1">Real-time daily sales, live queue management, and booking tracker.</p>
                    </div>
                    <div className="flex items-center gap-3">
                        <Button asChild variant="secondary" className="bg-amber-400 text-neutral-900 hover:bg-amber-300 font-semibold">
                            <Link href="/queuing">
                                <Ticket className="mr-2 size-4" />
                                Launch POS / Queuing
                            </Link>
                        </Button>
                        <Button asChild variant="outline" className="text-white border-neutral-700 hover:bg-neutral-800">
                            <Link href="/calendar">
                                <Calendar className="mr-2 size-4" />
                                Add Booking
                            </Link>
                        </Button>
                    </div>
                </div>

                {/* KPI Metrics Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <Card className="border-l-4 border-l-emerald-500 shadow-sm">
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-sm font-medium text-muted-foreground">Today's Gross Sales</CardTitle>
                            <DollarSign className="size-5 text-emerald-500" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{formatCurrency(metrics.today_gross_sales)}</div>
                            <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                                <TrendingUp className="size-3 text-emerald-500" /> Real-time daily revenue
                            </p>
                        </CardContent>
                    </Card>

                    <Card className="border-l-4 border-l-amber-500 shadow-sm">
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-sm font-medium text-muted-foreground">Today's Sessions</CardTitle>
                            <Printer className="size-5 text-amber-500" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{metrics.today_sessions} <span className="text-sm font-normal text-muted-foreground">sessions</span></div>
                            <p className="text-xs text-muted-foreground mt-1">
                                {metrics.today_photostrips} photostrips printed today
                            </p>
                        </CardContent>
                    </Card>

                    <Card className="border-l-4 border-l-blue-500 shadow-sm">
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-sm font-medium text-muted-foreground">Live Queue Status</CardTitle>
                            <Users className="size-5 text-blue-500" />
                        </CardHeader>
                        <CardContent>
                            <div className="flex items-baseline gap-2">
                                <span className="text-2xl font-bold text-blue-600">{metrics.waiting_queue}</span>
                                <span className="text-xs text-muted-foreground">Waiting</span>
                                <span className="text-2xl font-bold text-amber-600 ml-2">{metrics.in_booth_queue}</span>
                                <span className="text-xs text-muted-foreground">In Booth</span>
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">
                                Active queue entries in live booth
                            </p>
                        </CardContent>
                    </Card>

                    <Card className="border-l-4 border-l-purple-500 shadow-sm">
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-sm font-medium text-muted-foreground">Best Template</CardTitle>
                            <Sparkles className="size-5 text-purple-500" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-lg font-bold truncate">{topTemplate ? topTemplate.name : 'N/A'}</div>
                            <p className="text-xs text-muted-foreground mt-1">
                                {topTemplate?.queue_sessions_count ?? 0} sessions using this design
                            </p>
                        </CardContent>
                    </Card>
                </div>

                {/* Main Content Grid */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Left Column: Queue Sessions (2 cols) */}
                    <div className="lg:col-span-2 space-y-6">
                        {/* Live Queue & Recent POS */}
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between">
                                <div>
                                    <CardTitle className="text-lg">Recent Queue & POS Activity</CardTitle>
                                    <CardDescription>Live photo strip sessions processed at booth</CardDescription>
                                </div>
                                <Button asChild variant="outline" size="sm">
                                    <Link href="/queuing">View Queue</Link>
                                </Button>
                            </CardHeader>
                            <CardContent>
                                {recentSessions.length === 0 ? (
                                    <p className="text-sm text-muted-foreground py-4 text-center">No queue sessions recorded today yet.</p>
                                ) : (
                                    <div className="divide-y divide-border">
                                        {recentSessions.map((session) => (
                                            <div key={session.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                                <div className="flex items-center gap-3">
                                                    <span className="font-mono text-xs font-bold px-2.5 py-1 rounded bg-neutral-900 text-amber-400">
                                                        {session.queue_number}
                                                    </span>
                                                    <div>
                                                        <h4 className="text-sm font-semibold">{session.customer_name}</h4>
                                                        <p className="text-xs text-muted-foreground">
                                                            {session.sessions_count} {session.sessions_count === 1 ? 'session' : 'sessions'} ({session.total_photostrips} photostrips)
                                                            {session.templates.length > 0 && ` • ${session.templates.map(t => t.name).join(', ')}`}
                                                        </p>
                                                    </div>
                                                </div>
                                                <div className="flex items-center justify-between sm:justify-end gap-3">
                                                    <span className="font-semibold text-sm">{formatCurrency(session.total_price)}</span>
                                                    <Badge className={
                                                        session.status === 'completed' ? 'bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 border-emerald-200' :
                                                        session.status === 'in_booth' ? 'bg-amber-500/10 text-amber-600 hover:bg-amber-500/20 border-amber-200' :
                                                        'bg-blue-500/10 text-blue-600 hover:bg-blue-500/20 border-blue-200'
                                                    }>
                                                        {session.status.replace('_', ' ').toUpperCase()}
                                                    </Badge>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </CardContent>
                        </Card>

                        {/* Upcoming Bookings */}
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between">
                                <div>
                                    <CardTitle className="text-lg">Upcoming Scheduled Bookings</CardTitle>
                                    <CardDescription>Event photo booth bookings on calendar</CardDescription>
                                </div>
                                <Button asChild variant="outline" size="sm">
                                    <Link href="/calendar">View Calendar</Link>
                                </Button>
                            </CardHeader>
                            <CardContent>
                                {upcomingBookings.length === 0 ? (
                                    <p className="text-sm text-muted-foreground py-4 text-center">No upcoming bookings scheduled.</p>
                                ) : (
                                    <div className="space-y-3">
                                        {upcomingBookings.map((b) => (
                                            <div key={b.id} className="p-3.5 rounded-xl border bg-card hover:bg-accent/50 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                                <div className="space-y-1">
                                                    <div className="flex items-center gap-2">
                                                        <Badge variant="outline" className="text-xs font-mono">{b.booking_number}</Badge>
                                                        <h4 className="font-semibold text-sm">{b.event_name}</h4>
                                                    </div>
                                                    <p className="text-xs text-muted-foreground flex items-center gap-2">
                                                        <span><Users className="inline size-3 mr-1" /> {b.client_name}</span>
                                                        <span>•</span>
                                                        <span><Clock className="inline size-3 mr-1" /> {b.start_time} - {b.end_time}</span>
                                                    </p>
                                                </div>
                                                <div className="flex items-center justify-between sm:justify-end gap-3">
                                                    <div className="text-right">
                                                        <span className="text-xs text-muted-foreground block">{b.event_date}</span>
                                                        <span className="font-bold text-sm text-emerald-600">{formatCurrency(b.total_amount)}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </div>

                    {/* Right Column: Active Booth & Quick Tools */}
                    <div className="space-y-6">
                        {/* Active Booth Banner */}
                        <Card className="border-amber-500/30 bg-amber-500/5">
                            <CardHeader>
                                <CardTitle className="text-base flex items-center gap-2 text-amber-700 dark:text-amber-400">
                                    <MapPin className="size-4" /> Active Booth Event Location
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                {activeBooth ? (
                                    <div className="space-y-2">
                                        <h3 className="font-bold text-lg">{activeBooth.name}</h3>
                                        <p className="text-sm text-muted-foreground">{activeBooth.address}, {activeBooth.city}</p>
                                        <div className="pt-2 flex items-center gap-2">
                                            <Badge variant="default" className="bg-emerald-600">Active Station</Badge>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="text-center py-2">
                                        <p className="text-sm text-muted-foreground mb-3">No active booth location currently assigned.</p>
                                        <Button asChild size="sm" variant="outline">
                                            <Link href="/calendar">Add Booth Location</Link>
                                        </Button>
                                    </div>
                                )}
                            </CardContent>
                        </Card>

                        {/* Quick Navigation Cards */}
                        <Card>
                            <CardHeader>
                                <CardTitle className="text-base">System Quick Actions</CardTitle>
                            </CardHeader>
                            <CardContent className="grid grid-cols-1 gap-2">
                                <Button asChild variant="outline" className="justify-start h-auto py-3 px-4">
                                    <Link href="/queuing">
                                        <Ticket className="mr-3 size-5 text-amber-500" />
                                        <div className="text-left">
                                            <div className="font-semibold text-sm">Queuing & POS</div>
                                            <div className="text-xs text-muted-foreground">Process walk-in photostrip sessions & print tickets</div>
                                        </div>
                                    </Link>
                                </Button>

                                <Button asChild variant="outline" className="justify-start h-auto py-3 px-4">
                                    <Link href="/calendar">
                                        <Calendar className="mr-3 size-5 text-blue-500" />
                                        <div className="text-left">
                                            <div className="font-semibold text-sm">Calendar & Bookings</div>
                                            <div className="text-xs text-muted-foreground">Manage booth locations and event schedules</div>
                                        </div>
                                    </Link>
                                </Button>

                                <Button asChild variant="outline" className="justify-start h-auto py-3 px-4">
                                    <Link href="/financials">
                                        <DollarSign className="mr-3 size-5 text-emerald-500" />
                                        <div className="text-left">
                                            <div className="font-semibold text-sm">Financial Tracker & Sales</div>
                                            <div className="text-xs text-muted-foreground">Daily gross sales, expenses and net profit</div>
                                        </div>
                                    </Link>
                                </Button>

                                <Button asChild variant="outline" className="justify-start h-auto py-3 px-4">
                                    <Link href="/templates">
                                        <ImageIcon className="mr-3 size-5 text-purple-500" />
                                        <div className="text-left">
                                            <div className="font-semibold text-sm">Template Reports</div>
                                            <div className="text-xs text-muted-foreground">Analyze top performing templates and design catalog</div>
                                        </div>
                                    </Link>
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
