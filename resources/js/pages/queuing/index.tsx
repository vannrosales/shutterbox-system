import { useState } from 'react';
import { Head, useForm, router } from '@inertiajs/react';
import AppLayout from '@/layouts/app-layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { 
    AlertCircle, 
    CheckCircle2, 
    Clock, 
    DollarSign, 
    Filter, 
    Plus, 
    Printer, 
    QrCode, 
    Sparkles, 
    Ticket, 
    Trash2, 
    UserCheck, 
    Users 
} from 'lucide-react';
import type { BreadcrumbItem } from '@/types';

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
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [receiptSession, setReceiptSession] = useState<QueueSession | null>(null);
    const [statusFilter, setStatusFilter] = useState<string>('all');

    // POS Form State
    const { data, setData, post, processing, errors, reset } = useForm({
        customer_name: '',
        booth_location_id: boothLocations.length > 0 ? String(boothLocations[0].id) : '',
        sessions_count: 1,
        template_ids: [] as number[],
        extra_copies: 0,
        payment_method: 'cash',
        payment_status: 'paid',
        notes: '',
    });

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(amount);
    };

    // 1 session = 2 photostrips = ₱100
    // Extra copy = 2 photostrips = ₱100
    const basePhotostrips = data.sessions_count * 2;
    const extraPhotostrips = data.extra_copies * 2;
    const totalPhotostrips = basePhotostrips + extraPhotostrips;
    const basePrice = data.sessions_count * 100;
    const extraCopiesPrice = data.extra_copies * 100;
    const totalPrice = basePrice + extraCopiesPrice;

    const handleTemplateToggle = (templateId: number) => {
        if (data.template_ids.includes(templateId)) {
            setData('template_ids', data.template_ids.filter((id) => id !== templateId));
        } else {
            setData('template_ids', [...data.template_ids, templateId]);
        }
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        post('/queuing', {
            onSuccess: () => {
                setIsCreateOpen(false);
                reset();
            },
        });
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
        if (statusFilter === 'all') return true;
        return s.status === statusFilter;
    });

    return (
        <>
            <Head title="Queuing POS - ShutterBox" />

            <div className="flex flex-col gap-6 p-4 md:p-6">
                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-neutral-900 border border-neutral-800 p-6 rounded-2xl relative overflow-hidden shadow-sm">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-[#E50914]/10 rounded-full blur-3xl pointer-events-none" />
                    <div className="z-10">
                        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
                            <Ticket className="size-6 text-[#E50914]" /> Photostrip Session Queuing POS
                        </h1>
                        <p className="text-sm text-neutral-400 mt-1">
                            Process walk-in photo booth sessions, select templates, and calculate extra copies.
                        </p>
                    </div>

                    <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
                        <DialogTrigger asChild>
                            <Button className="bg-[#E50914] hover:bg-[#c10712] text-white font-semibold shadow-md z-10">
                                <Plus className="mr-2 size-4" /> New Queue Session
                            </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
                            <DialogHeader>
                                <DialogTitle className="flex items-center gap-2 text-xl">
                                    <Sparkles className="size-5 text-[#E50914]" /> Create Queue Ticket
                                </DialogTitle>
                                <DialogDescription>
                                    Default: 1 session = 2 photostrips (₱100). Additional copy = 2 photostrips (₱100 per copy).
                                </DialogDescription>
                            </DialogHeader>

                            <form onSubmit={handleSubmit} className="space-y-5 py-2">
                                {/* Customer Name & Location */}
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="customer_name">Customer / Group Name</Label>
                                        <Input
                                            id="customer_name"
                                            placeholder="e.g. Walk-in Guest / Maria"
                                            value={data.customer_name}
                                            onChange={(e) => setData('customer_name', e.target.value)}
                                        />
                                    </div>

                                    <div className="space-y-2">
                                        <Label htmlFor="booth_location">Booth Location</Label>
                                        <Select
                                            value={String(data.booth_location_id)}
                                            onValueChange={(val) => setData('booth_location_id', val)}
                                        >
                                            <SelectTrigger id="booth_location">
                                                <SelectValue placeholder="Select Booth Location" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {boothLocations.map((loc) => (
                                                    <SelectItem key={loc.id} value={String(loc.id)}>
                                                        {loc.name} ({loc.city})
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>

                                {/* Sessions Dropdown */}
                                <div className="space-y-2">
                                    <div className="flex justify-between items-center">
                                        <Label htmlFor="sessions_count" className="font-semibold text-sm">
                                            Dropdown : Sessions
                                        </Label>
                                        <span className="text-xs font-mono text-[#E50914]">
                                            1 Session = 2 Photostrips (₱100)
                                        </span>
                                    </div>
                                    <Select
                                        value={String(data.sessions_count)}
                                        onValueChange={(val) => setData('sessions_count', parseInt(val, 10))}
                                    >
                                        <SelectTrigger id="sessions_count" className="w-full">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="1">1 Session (2 photostrips - ₱100)</SelectItem>
                                            <SelectItem value="2">2 Sessions (4 photostrips - ₱200)</SelectItem>
                                            <SelectItem value="3">3 Sessions (6 photostrips - ₱300)</SelectItem>
                                            <SelectItem value="4">4 Sessions (8 photostrips - ₱400)</SelectItem>
                                            <SelectItem value="5">5 Sessions (10 photostrips - ₱500)</SelectItem>
                                            <SelectItem value="6">6 Sessions (12 photostrips - ₱600)</SelectItem>
                                            <SelectItem value="8">8 Sessions (16 photostrips - ₱800)</SelectItem>
                                            <SelectItem value="10">10 Sessions (20 photostrips - ₱1,000)</SelectItem>
                                        </SelectContent>
                                    </Select>
                                    {data.sessions_count >= 2 && (
                                        <p className="text-xs text-[#E50914] font-medium">
                                            ✓ {data.sessions_count} sessions selected: You can select 1 or more templates below!
                                        </p>
                                    )}
                                </div>

                                {/* Checkbox : Templates */}
                                <div className="space-y-3 rounded-xl border p-4 bg-accent/30">
                                    <div className="flex items-center justify-between">
                                        <Label className="font-semibold text-sm">
                                            Checkbox : Templates
                                        </Label>
                                        <span className="text-xs text-muted-foreground">
                                            {data.sessions_count >= 2 ? 'Select 1 or more templates' : 'Select template for session'}
                                        </span>
                                    </div>

                                    {templates.length === 0 ? (
                                        <p className="text-xs text-muted-foreground">No active templates found.</p>
                                    ) : (
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                            {templates.map((tpl) => {
                                                const isChecked = data.template_ids.includes(tpl.id);
                                                return (
                                                    <div
                                                        key={tpl.id}
                                                        onClick={() => handleTemplateToggle(tpl.id)}
                                                        className={`flex items-start space-x-3 p-3 rounded-lg border cursor-pointer transition-all ${
                                                            isChecked ? 'border-[#E50914] bg-[#E50914]/10 shadow-sm' : 'border-border hover:bg-accent'
                                                        }`}
                                                    >
                                                        <Checkbox
                                                            id={`template-${tpl.id}`}
                                                            checked={isChecked}
                                                            onCheckedChange={() => handleTemplateToggle(tpl.id)}
                                                        />
                                                        <div className="grid gap-1 leading-none">
                                                            <label
                                                                htmlFor={`template-${tpl.id}`}
                                                                className="text-xs font-semibold cursor-pointer"
                                                            >
                                                                {tpl.name}
                                                            </label>
                                                            <span className="text-[10px] text-muted-foreground">
                                                                {tpl.category} • {tpl.code}
                                                            </span>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                    {errors.template_ids && (
                                        <p className="text-xs text-destructive font-medium">{errors.template_ids}</p>
                                    )}
                                </div>

                                {/* Dropdown : Copies (optional) */}
                                <div className="space-y-2">
                                    <div className="flex justify-between items-center">
                                        <Label htmlFor="extra_copies" className="font-semibold text-sm">
                                            Dropdown : Copies (optional)
                                        </Label>
                                        <span className="text-xs text-[#E50914] font-medium">
                                            +₱100 per extra copy (2 photostrips)
                                        </span>
                                    </div>
                                    <Select
                                        value={String(data.extra_copies)}
                                        onValueChange={(val) => setData('extra_copies', parseInt(val, 10))}
                                    >
                                        <SelectTrigger id="extra_copies">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="0">0 Extra Copies (Base photostrips only)</SelectItem>
                                            <SelectItem value="1">+1 Extra Copy (2 photostrips - +₱100)</SelectItem>
                                            <SelectItem value="2">+2 Extra Copies (4 photostrips - +₱200)</SelectItem>
                                            <SelectItem value="3">+3 Extra Copies (6 photostrips - +₱300)</SelectItem>
                                            <SelectItem value="4">+4 Extra Copies (8 photostrips - +₱400)</SelectItem>
                                            <SelectItem value="5">+5 Extra Copies (10 photostrips - +₱500)</SelectItem>
                                            <SelectItem value="6">+6 Extra Copies (12 photostrips - +₱600)</SelectItem>
                                            <SelectItem value="8">+8 Extra Copies (16 photostrips - +₱800)</SelectItem>
                                            <SelectItem value="10">+10 Extra Copies (20 photostrips - +₱1,000)</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>

                                {/* Payment Method */}
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="payment_method">Payment Method</Label>
                                        <Select
                                            value={data.payment_method}
                                            onValueChange={(val) => setData('payment_method', val)}
                                        >
                                            <SelectTrigger id="payment_method">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="cash">Cash</SelectItem>
                                                <SelectItem value="gcash">GCash</SelectItem>
                                                <SelectItem value="maya">Maya</SelectItem>
                                                <SelectItem value="card">Card / Terminal</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    <div className="space-y-2">
                                        <Label htmlFor="payment_status">Payment Status</Label>
                                        <Select
                                            value={data.payment_status}
                                            onValueChange={(val) => setData('payment_status', val)}
                                        >
                                            <SelectTrigger id="payment_status">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="paid">Paid</SelectItem>
                                                <SelectItem value="pending">Pending</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>

                                {/* Order Calculation Summary Box */}
                                <div className="rounded-xl bg-neutral-900 border border-neutral-800 text-white p-4 space-y-2">
                                    <div className="text-xs uppercase tracking-wider text-neutral-400 font-semibold">
                                        Pricing & Photostrip Summary
                                    </div>
                                    <div className="flex justify-between text-sm">
                                        <span className="text-neutral-300">Base Sessions ({data.sessions_count} × ₱100):</span>
                                        <span className="font-mono">{formatCurrency(basePrice)}</span>
                                    </div>
                                    <div className="flex justify-between text-sm">
                                        <span className="text-neutral-300">Base Photostrips (1 session = 2 strips):</span>
                                        <span className="font-mono">{basePhotostrips} strips</span>
                                    </div>
                                    {data.extra_copies > 0 && (
                                        <div className="flex justify-between text-sm text-[#E50914]">
                                            <span>Extra Copies ({data.extra_copies} × ₱100):</span>
                                            <span className="font-mono">+{formatCurrency(extraCopiesPrice)} ({extraPhotostrips} strips)</span>
                                        </div>
                                    )}
                                    <div className="pt-2 border-t border-neutral-800 flex justify-between items-baseline">
                                        <div>
                                            <span className="text-sm font-semibold">Total Price:</span>
                                            <span className="text-xs text-neutral-400 block">{totalPhotostrips} total photostrips to print</span>
                                        </div>
                                        <span className="text-2xl font-bold text-[#E50914] font-mono">{formatCurrency(totalPrice)}</span>
                                    </div>
                                </div>

                                <DialogFooter>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={() => setIsCreateOpen(false)}
                                    >
                                        Cancel
                                    </Button>
                                    <Button
                                        type="submit"
                                        disabled={processing || data.template_ids.length === 0}
                                        className="bg-[#E50914] text-white font-semibold hover:bg-[#c10712]"
                                    >
                                        Generate Queue Ticket
                                    </Button>
                                </DialogFooter>
                            </form>
                        </DialogContent>
                    </Dialog>
                </div>

                {/* KPI Summary Banner */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    <Card>
                        <CardHeader className="p-4 pb-1">
                            <CardTitle className="text-xs font-medium text-muted-foreground">Today's Queue Entries</CardTitle>
                        </CardHeader>
                        <CardContent className="p-4 pt-1">
                            <div className="text-2xl font-bold">{todayStats.total_queue}</div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="p-4 pb-1">
                            <CardTitle className="text-xs font-medium text-muted-foreground">Now Waiting</CardTitle>
                        </CardHeader>
                        <CardContent className="p-4 pt-1">
                            <div className="text-2xl font-bold text-blue-600">{todayStats.waiting_now}</div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="p-4 pb-1">
                            <CardTitle className="text-xs font-medium text-muted-foreground">Currently In Booth</CardTitle>
                        </CardHeader>
                        <CardContent className="p-4 pt-1">
                            <div className="text-2xl font-bold text-amber-600">{todayStats.in_booth_now}</div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="p-4 pb-1">
                            <CardTitle className="text-xs font-medium text-muted-foreground">Completed Today</CardTitle>
                        </CardHeader>
                        <CardContent className="p-4 pt-1">
                            <div className="text-2xl font-bold text-emerald-600">{todayStats.completed_today}</div>
                        </CardContent>
                    </Card>
                </div>

                {/* Queue Filter Bar */}
                <div className="flex items-center justify-between gap-4 bg-card border rounded-xl p-3">
                    <div className="flex items-center gap-2">
                        <Filter className="size-4 text-muted-foreground" />
                        <span className="text-sm font-medium">Filter Queue:</span>
                        <div className="flex gap-1">
                            {['all', 'waiting', 'in_booth', 'completed', 'cancelled'].map((st) => (
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

                {/* Live Queue Cards / List */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filteredSessions.length === 0 ? (
                        <div className="col-span-full py-12 text-center border border-dashed border-neutral-800 rounded-xl">
                            <Ticket className="size-10 text-muted-foreground mx-auto mb-2" />
                            <h3 className="font-semibold text-base">No Queue Entries Found</h3>
                            <p className="text-sm text-muted-foreground">Click 'New Queue Session' above to add customer to queue.</p>
                        </div>
                    ) : (
                        filteredSessions.map((session) => (
                            <Card key={session.id} className="relative overflow-hidden flex flex-col justify-between border border-neutral-800 shadow-sm">
                                {/* Top Ticket Ribbon */}
                                <div className="p-4 border-b border-neutral-800 bg-neutral-900/60 flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <span className="font-mono text-base font-bold bg-neutral-950 text-[#E50914] border border-[#E50914]/30 px-3 py-1 rounded-md">
                                            {session.queue_number}
                                        </span>
                                        <Badge className={
                                            session.status === 'completed' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' :
                                            session.status === 'in_booth' ? 'bg-[#E50914]/10 text-[#E50914] border-[#E50914]/20' :
                                            session.status === 'cancelled' ? 'bg-red-500/10 text-red-500 border-red-500/20' :
                                            'bg-blue-500/10 text-blue-500 border-blue-500/20'
                                        }>
                                            {session.status.replace('_', ' ').toUpperCase()}
                                        </Badge>
                                    </div>

                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => setReceiptSession(session)}
                                        title="Print Receipt / Ticket"
                                    >
                                        <Printer className="size-4" />
                                    </Button>
                                </div>

                                <CardContent className="p-4 space-y-3 flex-1">
                                    <div>
                                        <h3 className="font-bold text-base">{session.customer_name}</h3>
                                        {session.booth_location && (
                                            <p className="text-xs text-muted-foreground">{session.booth_location.name}</p>
                                        )}
                                    </div>

                                    <div className="grid grid-cols-2 gap-2 text-xs border rounded-lg p-2.5 bg-background">
                                        <div>
                                            <span className="text-muted-foreground block">Sessions Count:</span>
                                            <span className="font-semibold">{session.sessions_count} session(s)</span>
                                        </div>
                                        <div>
                                            <span className="text-muted-foreground block">Photostrips:</span>
                                            <span className="font-semibold text-[#E50914]">
                                                {session.total_photostrips} strips total
                                            </span>
                                        </div>
                                        <div>
                                            <span className="text-muted-foreground block">Extra Copies:</span>
                                            <span className="font-semibold">+{session.extra_copies} ({session.extra_copies * 2} strips)</span>
                                        </div>
                                        <div>
                                            <span className="text-muted-foreground block">Total Amount:</span>
                                            <span className="font-bold text-emerald-600">{formatCurrency(session.total_price)}</span>
                                        </div>
                                    </div>

                                    {/* Templates Chosen */}
                                    <div>
                                        <span className="text-[11px] font-semibold text-muted-foreground block mb-1">Templates Chosen:</span>
                                        <div className="flex flex-wrap gap-1">
                                            {session.templates.length === 0 ? (
                                                <span className="text-xs text-muted-foreground italic">Standard</span>
                                            ) : (
                                                session.templates.map((tpl) => (
                                                    <Badge key={tpl.id} variant="secondary" className="text-[10px] font-normal">
                                                        {tpl.name}
                                                    </Badge>
                                                ))
                                            )}
                                        </div>
                                    </div>
                                </CardContent>

                                {/* Action Bar */}
                                <div className="p-3 border-t bg-muted/20 flex items-center justify-between gap-2">
                                    <div className="flex gap-1">
                                        {session.status === 'waiting' && (
                                            <Button
                                                size="sm"
                                                className="bg-[#E50914] hover:bg-[#c10712] text-white font-semibold text-xs h-8"
                                                onClick={() => handleStatusUpdate(session.id, 'in_booth')}
                                            >
                                                <UserCheck className="mr-1 size-3.5" /> Call to Booth
                                            </Button>
                                        )}

                                        {session.status === 'in_booth' && (
                                            <Button
                                                size="sm"
                                                className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs h-8"
                                                onClick={() => handleStatusUpdate(session.id, 'completed')}
                                            >
                                                <CheckCircle2 className="mr-1 size-3.5" /> Mark Completed
                                            </Button>
                                        )}
                                    </div>

                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="size-8 text-destructive hover:bg-destructive/10"
                                        onClick={() => handleDelete(session.id)}
                                    >
                                        <Trash2 className="size-4" />
                                    </Button>
                                </div>
                            </Card>
                        ))
                    )}
                </div>

                {/* Printable Ticket Receipt Modal */}
                {receiptSession && (
                    <Dialog open={!!receiptSession} onOpenChange={() => setReceiptSession(null)}>
                        <DialogContent className="max-w-md">
                            <DialogHeader>
                                <DialogTitle className="text-center text-lg">ShutterBox Queue Receipt</DialogTitle>
                            </DialogHeader>

                            <div className="p-6 bg-white text-neutral-900 font-mono rounded-xl border space-y-4 shadow-inner text-sm">
                                <div className="text-center border-b pb-3">
                                    <h2 className="font-bold text-xl tracking-wider uppercase">SHUTTERBOX PHOTOBOOTH</h2>
                                    <p className="text-xs text-neutral-500">Official Queue & Session Ticket</p>
                                </div>

                                <div className="text-center py-2 bg-neutral-100 rounded-lg">
                                    <span className="text-xs uppercase text-neutral-500 block">Queue Ticket Number</span>
                                    <span className="text-3xl font-extrabold text-neutral-900">{receiptSession.queue_number}</span>
                                </div>

                                <div className="space-y-1.5 text-xs">
                                    <div className="flex justify-between">
                                        <span className="text-neutral-500">Customer Name:</span>
                                        <span className="font-semibold">{receiptSession.customer_name}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-neutral-500">Sessions Count:</span>
                                        <span>{receiptSession.sessions_count} session(s)</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-neutral-500">Base Photostrips (1 sess = 2 strips):</span>
                                        <span>{receiptSession.photostrips_base_count} strips</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-neutral-500">Extra Copies (+₱100/ea = 2 strips):</span>
                                        <span>{receiptSession.extra_copies} copy set(s) ({receiptSession.extra_copies * 2} strips)</span>
                                    </div>
                                    <div className="flex justify-between font-bold text-neutral-900 pt-1 border-t">
                                        <span>Total Photostrips:</span>
                                        <span>{receiptSession.total_photostrips} strips</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-neutral-500">Selected Templates:</span>
                                        <span className="text-right">{receiptSession.templates.map(t => t.name).join(', ') || 'Standard'}</span>
                                    </div>
                                    <div className="flex justify-between text-sm font-bold pt-2 border-t text-emerald-700">
                                        <span>TOTAL PAID ({receiptSession.payment_method.toUpperCase()}):</span>
                                        <span>{formatCurrency(receiptSession.total_price)}</span>
                                    </div>
                                </div>

                                <div className="text-center pt-2 text-[10px] text-neutral-400">
                                    Please present this ticket when called to the photo booth station. Thank you!
                                </div>
                            </div>

                            <DialogFooter className="flex sm:justify-between">
                                <Button variant="outline" onClick={() => setReceiptSession(null)}>Close</Button>
                                <Button onClick={() => window.print()} className="bg-neutral-900 text-white">
                                    <Printer className="mr-2 size-4" /> Print Ticket
                                </Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>
                )}
            </div>
        </>
    );
}

QueuingIndex.layout = (page: React.ReactNode) => <AppLayout breadcrumbs={breadcrumbs}>{page}</AppLayout>;
