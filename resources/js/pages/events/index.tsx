import { useState } from 'react';
import { Head, useForm, router } from '@inertiajs/react';
import AppLayout from '@/layouts/app-layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { 
    Calendar, 
    DollarSign, 
    MapPin, 
    Pencil, 
    Plus, 
    Power, 
    Sparkles, 
    Trash2 
} from 'lucide-react';
import type { BreadcrumbItem } from '@/types';

interface BoothLocation {
    id: number;
    name: string;
    address: string | null;
    city: string | null;
    rent_fee: number;
    start_date: string;
    end_date: string;
    status: string;
    notes: string | null;
}

interface EventStats {
    total_events: number;
    active_events: number;
    upcoming_events: number;
    completed_events: number;
    inactive_events: number;
}

interface Props {
    events: BoothLocation[];
    stats: EventStats;
}

const breadcrumbs: BreadcrumbItem[] = [
    { title: 'Dashboard', href: '/dashboard' },
    { title: 'Events & Booths', href: '/events' },
];

export default function EventsIndex({ events, stats }: Props) {
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [editingEvent, setEditingEvent] = useState<BoothLocation | null>(null);

    // Create Form
    const createForm = useForm({
        name: '',
        address: '',
        city: '',
        rent_fee: '0.00',
        start_date: new Date().toISOString().split('T')[0],
        end_date: new Date().toISOString().split('T')[0],
        status: 'active',
        notes: '',
    });

    // Edit Form
    const editForm = useForm({
        name: '',
        address: '',
        city: '',
        rent_fee: '0.00',
        start_date: '',
        end_date: '',
        status: 'active',
        notes: '',
    });

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(amount);
    };

    const handleCreateSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        createForm.post('/events', {
            onSuccess: () => {
                setIsCreateOpen(false);
                createForm.reset();
            },
        });
    };

    const handleEditOpen = (event: BoothLocation) => {
        setEditingEvent(event);
        editForm.setData({
            name: event.name,
            address: event.address || '',
            city: event.city || '',
            rent_fee: String(event.rent_fee || 0),
            start_date: event.start_date.split('T')[0],
            end_date: event.end_date.split('T')[0],
            status: event.status,
            notes: event.notes || '',
        });
    };

    const handleEditSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingEvent) return;
        editForm.put(`/events/${editingEvent.id}`, {
            onSuccess: () => {
                setEditingEvent(null);
            },
        });
    };

    const handleToggleStatus = (id: number) => {
        router.patch(`/events/${id}/toggle`);
    };

    const handleDelete = (id: number, name: string) => {
        if (confirm(`Are you sure you want to delete "${name}"? This action cannot be undone.`)) {
            router.delete(`/events/${id}`);
        }
    };

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'active':
                return <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30">Active</Badge>;
            case 'upcoming':
                return <Badge className="bg-blue-500/10 text-blue-400 border-blue-500/30">Upcoming</Badge>;
            case 'completed':
                return <Badge className="bg-neutral-800 text-neutral-400 border-neutral-700">Completed</Badge>;
            case 'inactive':
            default:
                return <Badge variant="outline" className="text-neutral-500 border-neutral-800">Deactivated</Badge>;
        }
    };

    return (
        <>
            <Head title="Events & Booths Management - ShutterBox" />

            <div className="flex flex-col gap-4 p-4 md:p-6 max-w-[1700px] mx-auto w-full">
                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-neutral-900 border border-neutral-800 p-5 rounded-2xl relative overflow-hidden shadow-sm">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-[#E50914]/10 rounded-full blur-3xl pointer-events-none" />
                    <div className="z-10">
                        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2 text-white">
                            <MapPin className="size-6 text-[#E50914]" /> Events & Booth Locations
                        </h1>
                        <p className="text-sm text-neutral-400 mt-1">
                            Manage event locations, toggle active status, and configure venue rent fees.
                        </p>
                    </div>

                    <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
                        <DialogTrigger asChild>
                            <Button className="bg-[#E50914] hover:bg-[#c10712] text-white font-semibold z-10">
                                <Plus className="mr-2 size-4" /> Add Event Location
                            </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-md border border-neutral-800 bg-neutral-950 text-white p-6 rounded-2xl shadow-2xl">
                            <DialogHeader>
                                <DialogTitle className="flex items-center gap-2 text-lg font-bold">
                                    <Sparkles className="size-5 text-[#E50914]" /> Add Event Location
                                </DialogTitle>
                                <DialogDescription className="text-xs text-neutral-400">
                                    Register a booth location venue and rent expense.
                                </DialogDescription>
                            </DialogHeader>

                            <form onSubmit={handleCreateSubmit} className="space-y-3.5 py-2 text-xs">
                                <div className="space-y-1.5">
                                    <Label htmlFor="c_name">Event / Booth Name</Label>
                                    <Input
                                        id="c_name"
                                        placeholder="e.g. SM Megamall Main Atrium"
                                        value={createForm.data.name}
                                        onChange={(e) => createForm.setData('name', e.target.value)}
                                        className="h-9 text-xs bg-neutral-900 border-neutral-800"
                                        required
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                    <div className="space-y-1.5">
                                        <Label htmlFor="c_address">Venue / Address</Label>
                                        <Input
                                            id="c_address"
                                            placeholder="e.g. EDSA cor Julia Vargas"
                                            value={createForm.data.address}
                                            onChange={(e) => createForm.setData('address', e.target.value)}
                                            className="h-9 text-xs bg-neutral-900 border-neutral-800"
                                        />
                                    </div>

                                    <div className="space-y-1.5">
                                        <Label htmlFor="c_city">City</Label>
                                        <Input
                                            id="c_city"
                                            placeholder="e.g. Mandaluyong"
                                            value={createForm.data.city}
                                            onChange={(e) => createForm.setData('city', e.target.value)}
                                            className="h-9 text-xs bg-neutral-900 border-neutral-800"
                                        />
                                    </div>
                                </div>

                                <div className="space-y-1.5">
                                    <Label htmlFor="c_rent_fee">Rent Fee (₱)</Label>
                                    <Input
                                        id="c_rent_fee"
                                        type="number"
                                        step="0.01"
                                        placeholder="0.00"
                                        value={createForm.data.rent_fee}
                                        onChange={(e) => createForm.setData('rent_fee', e.target.value)}
                                        className="h-9 text-xs bg-neutral-900 border-neutral-800 font-mono"
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                    <div className="space-y-1.5">
                                        <Label htmlFor="c_start_date">Start Date</Label>
                                        <Input
                                            id="c_start_date"
                                            type="date"
                                            value={createForm.data.start_date}
                                            onChange={(e) => createForm.setData('start_date', e.target.value)}
                                            className="h-9 text-xs bg-neutral-900 border-neutral-800"
                                            required
                                        />
                                    </div>

                                    <div className="space-y-1.5">
                                        <Label htmlFor="c_end_date">End Date</Label>
                                        <Input
                                            id="c_end_date"
                                            type="date"
                                            value={createForm.data.end_date}
                                            onChange={(e) => createForm.setData('end_date', e.target.value)}
                                            className="h-9 text-xs bg-neutral-900 border-neutral-800"
                                            required
                                        />
                                    </div>
                                </div>

                                <div className="space-y-1.5">
                                    <Label htmlFor="c_status">Initial Status</Label>
                                    <Select
                                        value={createForm.data.status}
                                        onValueChange={(val) => createForm.setData('status', val)}
                                    >
                                        <SelectTrigger id="c_status" className="h-9 text-xs bg-neutral-900 border-neutral-800">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent className="bg-neutral-900 border-neutral-800 text-white">
                                            <SelectItem value="active">Active</SelectItem>
                                            <SelectItem value="upcoming">Upcoming</SelectItem>
                                            <SelectItem value="completed">Completed</SelectItem>
                                            <SelectItem value="inactive">Inactive</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>

                                <DialogFooter className="pt-2">
                                    <Button type="button" variant="outline" onClick={() => setIsCreateOpen(false)} className="h-9 text-xs">
                                        Cancel
                                    </Button>
                                    <Button type="submit" disabled={createForm.processing} className="h-9 text-xs bg-[#E50914] text-white hover:bg-[#c10712]">
                                        Create Event
                                    </Button>
                                </DialogFooter>
                            </form>
                        </DialogContent>
                    </Dialog>
                </div>

                {/* KPI Stats */}
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                    <Card className="py-2.5 px-3.5 flex flex-row items-center justify-between border-neutral-800 bg-neutral-900/70 shadow-none rounded-xl">
                        <span className="text-xs font-medium text-neutral-400">Total Events</span>
                        <span className="text-base font-bold font-mono text-white">{stats.total_events}</span>
                    </Card>

                    <Card className="py-2.5 px-3.5 flex flex-row items-center justify-between border-neutral-800 bg-neutral-900/70 shadow-none rounded-xl">
                        <span className="text-xs font-medium text-neutral-400">Active</span>
                        <span className="text-base font-bold font-mono text-emerald-400">{stats.active_events}</span>
                    </Card>

                    <Card className="py-2.5 px-3.5 flex flex-row items-center justify-between border-neutral-800 bg-neutral-900/70 shadow-none rounded-xl">
                        <span className="text-xs font-medium text-neutral-400">Upcoming</span>
                        <span className="text-base font-bold font-mono text-blue-400">{stats.upcoming_events}</span>
                    </Card>

                    <Card className="py-2.5 px-3.5 flex flex-row items-center justify-between border-neutral-800 bg-neutral-900/70 shadow-none rounded-xl">
                        <span className="text-xs font-medium text-neutral-400">Completed</span>
                        <span className="text-base font-bold font-mono text-neutral-400">{stats.completed_events}</span>
                    </Card>

                    <Card className="py-2.5 px-3.5 flex flex-row items-center justify-between border-neutral-800 bg-neutral-900/70 shadow-none rounded-xl col-span-2 sm:col-span-1">
                        <span className="text-xs font-medium text-neutral-400">Deactivated</span>
                        <span className="text-base font-bold font-mono text-amber-400">{stats.inactive_events}</span>
                    </Card>
                </div>

                {/* Events List Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {events.length === 0 ? (
                        <div className="col-span-full py-12 text-center border border-dashed border-neutral-800 rounded-xl bg-neutral-900/30">
                            <MapPin className="size-10 text-neutral-500 mx-auto mb-2" />
                            <h3 className="font-semibold text-base text-neutral-200">No Events Found</h3>
                            <p className="text-sm text-neutral-400">Click 'Add Event Location' to register your first venue.</p>
                        </div>
                    ) : (
                        events.map((event) => (
                            <Card key={event.id} className="border border-neutral-800 bg-neutral-950 text-white flex flex-col justify-between shadow-sm">
                                <CardHeader className="p-4 pb-2">
                                    <div className="flex items-start justify-between gap-2">
                                        <div>
                                            <CardTitle className="text-base font-bold text-neutral-100">{event.name}</CardTitle>
                                            <CardDescription className="text-xs text-neutral-400 flex items-center gap-1 mt-0.5">
                                                <MapPin className="size-3 text-neutral-500" />
                                                {event.address ? `${event.address}, ` : ''}{event.city || 'Location'}
                                            </CardDescription>
                                        </div>
                                        {getStatusBadge(event.status)}
                                    </div>
                                </CardHeader>

                                <CardContent className="p-4 pt-2 space-y-2.5 text-xs">
                                    <div className="grid grid-cols-2 gap-2 p-2.5 bg-neutral-900/60 rounded-lg border border-neutral-800">
                                        <div>
                                            <span className="text-neutral-400 block text-[11px]">Duration:</span>
                                            <span className="font-semibold text-neutral-200 font-mono text-[11px]">
                                                {event.start_date.split('T')[0]} - {event.end_date.split('T')[0]}
                                            </span>
                                        </div>
                                        <div>
                                            <span className="text-neutral-400 block text-[11px]">Rent Fee:</span>
                                            <span className="font-bold text-emerald-400 font-mono">
                                                {formatCurrency(event.rent_fee || 0)}
                                            </span>
                                        </div>
                                    </div>

                                    {event.notes && (
                                        <p className="text-neutral-400 italic text-xs bg-neutral-900/30 p-2 rounded border border-neutral-800/50">
                                            {event.notes}
                                        </p>
                                    )}
                                </CardContent>

                                <div className="p-3 border-t border-neutral-800 bg-neutral-900/40 flex items-center justify-between gap-2">
                                    <Button
                                        size="sm"
                                        variant={event.status === 'active' ? 'destructive' : 'default'}
                                        onClick={() => handleToggleStatus(event.id)}
                                        className={`h-7 text-xs font-medium ${
                                            event.status === 'active' 
                                                ? 'bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 border border-amber-500/30' 
                                                : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                                        }`}
                                    >
                                        <Power className="mr-1 size-3" />
                                        {event.status === 'active' ? 'Deactivate' : 'Activate Event'}
                                    </Button>

                                    <div className="flex items-center gap-1">
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="size-7 text-neutral-400 hover:text-white"
                                            onClick={() => handleEditOpen(event)}
                                            title="Edit Event"
                                        >
                                            <Pencil className="size-3.5" />
                                        </Button>

                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="size-7 text-red-400 hover:bg-red-500/10 hover:text-red-300"
                                            onClick={() => handleDelete(event.id, event.name)}
                                            title="Delete Event"
                                        >
                                            <Trash2 className="size-3.5" />
                                        </Button>
                                    </div>
                                </div>
                            </Card>
                        ))
                    )}
                </div>

                {/* Edit Modal */}
                {editingEvent && (
                    <Dialog open={!!editingEvent} onOpenChange={() => setEditingEvent(null)}>
                        <DialogContent className="max-w-md border border-neutral-800 bg-neutral-950 text-white p-6 rounded-2xl shadow-2xl">
                            <DialogHeader>
                                <DialogTitle className="flex items-center gap-2 text-lg font-bold">
                                    <Pencil className="size-5 text-[#E50914]" /> Edit Event Location
                                </DialogTitle>
                            </DialogHeader>

                            <form onSubmit={handleEditSubmit} className="space-y-3.5 py-2 text-xs">
                                <div className="space-y-1.5">
                                    <Label htmlFor="e_name">Event Name</Label>
                                    <Input
                                        id="e_name"
                                        value={editForm.data.name}
                                        onChange={(e) => editForm.setData('name', e.target.value)}
                                        className="h-9 text-xs bg-neutral-900 border-neutral-800"
                                        required
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                    <div className="space-y-1.5">
                                        <Label htmlFor="e_address">Venue / Address</Label>
                                        <Input
                                            id="e_address"
                                            value={editForm.data.address}
                                            onChange={(e) => editForm.setData('address', e.target.value)}
                                            className="h-9 text-xs bg-neutral-900 border-neutral-800"
                                        />
                                    </div>

                                    <div className="space-y-1.5">
                                        <Label htmlFor="e_city">City</Label>
                                        <Input
                                            id="e_city"
                                            value={editForm.data.city}
                                            onChange={(e) => editForm.setData('city', e.target.value)}
                                            className="h-9 text-xs bg-neutral-900 border-neutral-800"
                                        />
                                    </div>
                                </div>

                                <div className="space-y-1.5">
                                    <Label htmlFor="e_rent_fee">Rent Fee (₱)</Label>
                                    <Input
                                        id="e_rent_fee"
                                        type="number"
                                        step="0.01"
                                        value={editForm.data.rent_fee}
                                        onChange={(e) => editForm.setData('rent_fee', e.target.value)}
                                        className="h-9 text-xs bg-neutral-900 border-neutral-800 font-mono"
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                    <div className="space-y-1.5">
                                        <Label htmlFor="e_start_date">Start Date</Label>
                                        <Input
                                            id="e_start_date"
                                            type="date"
                                            value={editForm.data.start_date}
                                            onChange={(e) => editForm.setData('start_date', e.target.value)}
                                            className="h-9 text-xs bg-neutral-900 border-neutral-800"
                                            required
                                        />
                                    </div>

                                    <div className="space-y-1.5">
                                        <Label htmlFor="e_end_date">End Date</Label>
                                        <Input
                                            id="e_end_date"
                                            type="date"
                                            value={editForm.data.end_date}
                                            onChange={(e) => editForm.setData('end_date', e.target.value)}
                                            className="h-9 text-xs bg-neutral-900 border-neutral-800"
                                            required
                                        />
                                    </div>
                                </div>

                                <div className="space-y-1.5">
                                    <Label htmlFor="e_status">Status</Label>
                                    <Select
                                        value={editForm.data.status}
                                        onValueChange={(val) => editForm.setData('status', val)}
                                    >
                                        <SelectTrigger id="e_status" className="h-9 text-xs bg-neutral-900 border-neutral-800">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent className="bg-neutral-900 border-neutral-800 text-white">
                                            <SelectItem value="active">Active</SelectItem>
                                            <SelectItem value="upcoming">Upcoming</SelectItem>
                                            <SelectItem value="completed">Completed</SelectItem>
                                            <SelectItem value="inactive">Inactive</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>

                                <DialogFooter className="pt-2">
                                    <Button type="button" variant="outline" onClick={() => setEditingEvent(null)} className="h-9 text-xs">
                                        Cancel
                                    </Button>
                                    <Button type="submit" disabled={editForm.processing} className="h-9 text-xs bg-[#E50914] text-white hover:bg-[#c10712]">
                                        Save Changes
                                    </Button>
                                </DialogFooter>
                            </form>
                        </DialogContent>
                    </Dialog>
                )}
            </div>
        </>
    );
}

EventsIndex.layout = (page: React.ReactNode) => <AppLayout breadcrumbs={breadcrumbs}>{page}</AppLayout>;
