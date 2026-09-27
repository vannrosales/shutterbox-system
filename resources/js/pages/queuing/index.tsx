import { useState } from 'react';
import { Head, router } from '@inertiajs/react';
import { Button } from '@/components/ui/button';
import { Filter, Ticket } from 'lucide-react';
import type { BreadcrumbItem } from '@/types';
import { QueueStats } from './partials/queue-stats';
import { QueueCard } from './partials/queue-card';
import { CreateQueueForm } from './partials/create-queue-form';
import { EditQueueModal } from './partials/edit-queue-modal';
import { ReceiptModal } from './partials/receipt-modal';

interface Template {
    id: number;
    name: string;
    code: string;
    category: string;
    is_active: boolean;
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
    booth_location_id: number | null;
    sessions_count: number;
    photostrips_base_count: number;
    extra_copies: number;
    total_photostrips: number;
    base_price_per_session: number;
    base_total: number;
    extra_copies_price: number;
    total_price: number;
    payment_method: string;
    payment_status: string;
    status: string;
    notes: string | null;
    created_at: string;
    templates: Template[];
    booth_location?: BoothLocation;
}

interface TodayStats {
    total_queue: number;
    completed_today: number;
    waiting_now: number;
    in_booth_now: number;
}

interface Props {
    sessions: QueueSession[];
    templates: Template[];
    boothLocations: BoothLocation[];
    todayStats: TodayStats;
}

const breadcrumbs: BreadcrumbItem[] = [
    { title: 'Dashboard', href: '/dashboard' },
    { title: 'Queuing POS', href: '/queuing' },
];

export default function QueuingIndex({ sessions, templates, boothLocations, todayStats }: Props) {
    const [editingSession, setEditingSession] = useState<QueueSession | null>(null);
    const [receiptSession, setReceiptSession] = useState<QueueSession | null>(null);
    const [statusFilter, setStatusFilter] = useState<string>('active');

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(amount);
    };

    const handleStatusUpdate = (sessionId: number, newStatus: string) => {
        router.patch(`/queuing/${sessionId}/status`, { status: newStatus });
    };

    const handleDelete = (sessionId: number) => {
        if (confirm('Are you sure you want to remove this queue entry?')) {
            router.delete(`/queuing/${sessionId}`);
        }
    };

    const filteredSessions = sessions.filter((s) => {
        if (statusFilter === 'active') return s.status === 'waiting' || s.status === 'in_booth';
        if (statusFilter === 'all') return true;
        return s.status === statusFilter;
    });

    return (
        <>
            <Head title="Queuing POS - ShutterBox" />

            <div className="flex flex-col gap-6 p-4 md:p-6">
                {/* Edit Queue Ticket Dialog */}
                <EditQueueModal
                    session={editingSession}
                    onClose={() => setEditingSession(null)}
                    templates={templates}
                    boothLocations={boothLocations}
                    formatCurrency={formatCurrency}
                />

                {/* Printable Ticket Receipt Modal */}
                <ReceiptModal
                    session={receiptSession}
                    onClose={() => setReceiptSession(null)}
                    formatCurrency={formatCurrency}
                />

                {/* KPI Summary Banner */}
                <QueueStats todayStats={todayStats} />

                {/* Main POS Split Layout */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                    {/* Left Column: Inline Create Queue Form */}
                    <div className="lg:col-span-5 xl:col-span-4 lg:sticky lg:top-6">
                        <CreateQueueForm
                            templates={templates}
                            boothLocations={boothLocations}
                            formatCurrency={formatCurrency}
                        />
                    </div>

                    {/* Right Column: Active Queue List & Controls */}
                    <div className="lg:col-span-7 xl:col-span-8 flex flex-col gap-4">
                        {/* Queue Filter Bar */}
                        <div className="flex items-center justify-between gap-4 bg-card border border-neutral-800 rounded-xl p-3 flex-wrap">
                            <div className="flex items-center gap-2 flex-wrap">
                                <Filter className="size-4 text-muted-foreground" />
                                <span className="text-sm font-medium">Filter Queue:</span>
                                <div className="flex gap-1 flex-wrap">
                                    {['active', 'waiting', 'in_booth', 'completed', 'all'].map((st) => (
                                        <Button
                                            key={st}
                                            variant={statusFilter === st ? 'default' : 'ghost'}
                                            size="sm"
                                            onClick={() => setStatusFilter(st)}
                                            className={`capitalize text-xs h-8 ${statusFilter === st ? 'bg-[#E50914] text-white hover:bg-[#c10712]' : ''}`}
                                        >
                                            {st.replace('_', ' ')}
                                        </Button>
                                    ))}
                                </div>
                            </div>

                            <span className="text-xs text-muted-foreground font-mono">
                                Showing {filteredSessions.length} entries
                            </span>
                        </div>

                        {/* Live Queue Cards Grid */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {filteredSessions.length === 0 ? (
                                <div className="col-span-full py-12 text-center border border-dashed border-neutral-800 rounded-xl bg-neutral-900/30">
                                    <Ticket className="size-10 text-muted-foreground mx-auto mb-2" />
                                    <h3 className="font-semibold text-base text-neutral-200">No Queue Entries Found</h3>
                                    <p className="text-sm text-neutral-400">Fill out the form on the left to add a customer to the queue.</p>
                                </div>
                            ) : (
                                filteredSessions.map((session) => (
                                    <QueueCard
                                        key={session.id}
                                        session={session}
                                        onEdit={setEditingSession}
                                        onPrintReceipt={setReceiptSession}
                                        onStatusUpdate={handleStatusUpdate}
                                        onDelete={handleDelete}
                                        formatCurrency={formatCurrency}
                                    />
                                ))
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}
