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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
    Calendar as CalendarIcon, 
    ChevronLeft, 
    ChevronRight, 
    Clock, 
    DollarSign, 
    MapPin, 
    Plus, 
    Sparkles, 
    Trash2, 
    Users 
} from 'lucide-react';
import type { BreadcrumbItem } from '@/types';

interface Template {
    id: number;
    name: string;
    code: string;
}

interface BoothLocation {
    id: number;
    name: string;
    address: string;
    city: string;
    start_date: string;
    end_date: string;
    status: string;
    rent_fee: number;
    notes: string | null;
}

interface Booking {
    id: number;
    booking_number: string;
    client_name: string;
    client_phone: string;
    client_email: string | null;
    booth_location_id: number | null;
    event_name: string;
    event_date: string;
    start_time: string;
    end_time: string;
    sessions_count: number;
    extra_copies: number;
    base_amount: number;
    extra_copies_amount: number;
    total_amount: number;
    deposit_amount: number;
    status: string;
    notes: string | null;
    templates: Template[];
    booth_location?: BoothLocation;
}

interface Props {
    boothLocations: BoothLocation[];
    bookings: Booking[];
    templates: Template[];
}

const breadcrumbs: BreadcrumbItem[] = [
    { title: 'Dashboard', href: '/dashboard' },
    { title: 'Calendar & Bookings', href: '/calendar' },
];

export default function CalendarIndex({ boothLocations, bookings, templates }: Props) {
    const [isBoothModalOpen, setIsBoothModalOpen] = useState(false);
    const [isBookingModalOpen, setIsBookingModalOpen] = useState(false);
    const [currentMonthDate, setCurrentMonthDate] = useState<Date>(new Date());
    const [selectedDayEvents, setSelectedDayEvents] = useState<{ date: string; booths: BoothLocation[]; bookings: Booking[] } | null>(null);

    // Booth Location Form
    const boothForm = useForm({
        name: '',
        address: '',
        city: '',
        start_date: new Date().toISOString().split('T')[0],
        end_date: new Date().toISOString().split('T')[0],
        status: 'active',
        rent_fee: '',
        notes: '',
    });

    // Booking Form
    const bookingForm = useForm({
        client_name: '',
        client_phone: '',
        client_email: '',
        booth_location_id: boothLocations.length > 0 ? String(boothLocations[0].id) : '',
        event_name: '',
        event_date: new Date().toISOString().split('T')[0],
        start_time: '13:00',
        end_time: '18:00',
        sessions_count: 2,
        extra_copies: 0,
        deposit_amount: 500,
        template_ids: [] as number[],
        notes: '',
    });

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(amount);
    };

    // Form handlers
    const handleBoothSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        boothForm.post('/calendar/booths', {
            onSuccess: () => {
                setIsBoothModalOpen(false);
                boothForm.reset();
            },
        });
    };

    const handleBookingSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        bookingForm.post('/calendar/bookings', {
            onSuccess: () => {
                setIsBookingModalOpen(false);
                bookingForm.reset();
            },
        });
    };

    const handleTemplateToggle = (tplId: number) => {
        const current = bookingForm.data.template_ids;
        const maxAllowed = bookingForm.data.sessions_count;
        if (current.includes(tplId)) {
            bookingForm.setData('template_ids', current.filter((id) => id !== tplId));
        } else {
            if (maxAllowed === 1) {
                bookingForm.setData('template_ids', [tplId]);
            } else if (current.length < maxAllowed) {
                bookingForm.setData('template_ids', [...current, tplId]);
            } else {
                bookingForm.setData('template_ids', [...current.slice(1), tplId]);
            }
        }
    };

    const handleBookingSessionsChange = (val: string) => {
        const newCount = parseInt(val, 10);
        bookingForm.setData((prevData) => ({
            ...prevData,
            sessions_count: newCount,
            template_ids: prevData.template_ids.slice(0, newCount),
        }));
    };

    const handleDeleteBooth = (id: number) => {
        if (confirm('Delete this booth location event?')) {
            router.delete(`/calendar/booths/${id}`);
        }
    };

    const handleDeleteBooking = (id: number) => {
        if (confirm('Delete this booking?')) {
            router.delete(`/calendar/bookings/${id}`);
        }
    };

    // Calendar grid generator logic
    const year = currentMonthDate.getFullYear();
    const month = currentMonthDate.getMonth();
    const monthName = currentMonthDate.toLocaleString('default', { month: 'long', year: 'numeric' });

    const firstDayIndex = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const monthDays: (number | null)[] = [];
    for (let i = 0; i < firstDayIndex; i++) {
        monthDays.push(null);
    }
    for (let i = 1; i <= daysInMonth; i++) {
        monthDays.push(i);
    }

    const prevMonth = () => setCurrentMonthDate(new Date(year, month - 1, 1));
    const nextMonth = () => setCurrentMonthDate(new Date(year, month + 1, 1));

    // 1 session = 2 photostrips = ₱100
    // 1 extra copy set = 2 photostrips = ₱100
    const bookingBasePrice = bookingForm.data.sessions_count * 100;
    const bookingExtraCopiesPrice = bookingForm.data.extra_copies * 100;
    const bookingTotalPrice = bookingBasePrice + bookingExtraCopiesPrice;

    return (
        <>
            <Head title="Calendar & Bookings - ShutterBox" />

            <div className="flex flex-col gap-6 p-4 md:p-6">
                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-neutral-900 border border-neutral-800 p-6 rounded-2xl relative overflow-hidden shadow-sm">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-[#E50914]/10 rounded-full blur-3xl pointer-events-none" />
                    <div className="z-10">
                        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
                            <CalendarIcon className="size-6 text-[#E50914]" /> Booth Events & Bookings Calendar
                        </h1>
                        <p className="text-sm text-neutral-400 mt-1">
                            Schedule photo booth event locations and manage client event bookings.
                        </p>
                    </div>

                    <div className="flex items-center gap-3 z-10">
                        <Dialog open={isBoothModalOpen} onOpenChange={setIsBoothModalOpen}>
                            <DialogTrigger asChild>
                                <Button variant="outline" className="border-[#E50914]/40 hover:bg-[#E50914]/10 text-white">
                                    <MapPin className="mr-2 size-4 text-[#E50914]" /> Add Event Location
                                </Button>
                            </DialogTrigger>
                            <DialogContent className="max-w-lg border border-neutral-800 bg-neutral-950 text-white p-6 rounded-2xl shadow-2xl">
                                <DialogHeader>
                                    <DialogTitle className="text-lg font-bold tracking-tight">Add Booth Event Location</DialogTitle>
                                    <DialogDescription className="text-xs text-neutral-400">
                                        Register a venue or event location where the ShutterBox booth is deployed.
                                    </DialogDescription>
                                </DialogHeader>

                                <form onSubmit={handleBoothSubmit} className="space-y-4 py-2">
                                    <div className="space-y-2">
                                        <Label htmlFor="booth_name">Booth / Event Name</Label>
                                        <Input
                                            id="booth_name"
                                            placeholder="e.g. SM Megamall Main Atrium Booth"
                                            value={boothForm.data.name}
                                            onChange={(e) => boothForm.setData('name', e.target.value)}
                                            required
                                        />
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <Label htmlFor="address">Address / Venue</Label>
                                            <Input
                                                id="address"
                                                placeholder="e.g. EDSA cor Julia Vargas"
                                                value={boothForm.data.address}
                                                onChange={(e) => boothForm.setData('address', e.target.value)}
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="city">City</Label>
                                            <Input
                                                id="city"
                                                placeholder="e.g. Mandaluyong City"
                                                value={boothForm.data.city}
                                                onChange={(e) => boothForm.setData('city', e.target.value)}
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="rent_fee">Rent Fee:</Label>
                                            <Input
                                                id="rent_fee"
                                                placeholder="e.g. 3500.00"
                                                value={boothForm.data.rent_fee}
                                                onChange={(e) => boothForm.setData('rent_fee', e.target.value)}
                                            />
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <Label htmlFor="start_date">Start Date</Label>
                                            <Input
                                                id="start_date"
                                                type="date"
                                                value={boothForm.data.start_date}
                                                onChange={(e) => boothForm.setData('start_date', e.target.value)}
                                                required
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="end_date">End Date</Label>
                                            <Input
                                                id="end_date"
                                                type="date"
                                                value={boothForm.data.end_date}
                                                onChange={(e) => boothForm.setData('end_date', e.target.value)}
                                                required
                                            />
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <Label htmlFor="booth_status">Status</Label>
                                        <Select
                                            value={boothForm.data.status}
                                            onValueChange={(val) => boothForm.setData('status', val)}
                                        >
                                            <SelectTrigger id="booth_status">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="active">Active Station</SelectItem>
                                                <SelectItem value="upcoming">Upcoming Event</SelectItem>
                                                <SelectItem value="completed">Completed</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    <DialogFooter>
                                        <Button type="button" variant="outline" onClick={() => setIsBoothModalOpen(false)}>Cancel</Button>
                                        <Button type="submit" disabled={boothForm.processing} className="bg-[#E50914] hover:bg-[#c10712] text-white">
                                            Save Event Location
                                        </Button>
                                    </DialogFooter>
                                </form>
                            </DialogContent>
                        </Dialog>

                        <Dialog open={isBookingModalOpen} onOpenChange={setIsBookingModalOpen}>
                            <DialogTrigger asChild>
                                <Button className="bg-[#E50914] hover:bg-[#c10712] text-white font-semibold">
                                    <Plus className="mr-2 size-4" /> Add Booking
                                </Button>
                            </DialogTrigger>
                            <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto border border-neutral-800 bg-neutral-950 text-white p-6 rounded-2xl shadow-2xl">
                                <DialogHeader>
                                    <DialogTitle className="text-lg font-bold tracking-tight">Create Client Event Booking</DialogTitle>
                                    <DialogDescription className="text-xs text-neutral-400">
                                        Schedule a private photo booth reservation (Debut, Wedding, Corporate Summit).
                                    </DialogDescription>
                                </DialogHeader>

                                <form onSubmit={handleBookingSubmit} className="space-y-4 py-2">
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <Label htmlFor="client_name">Client Name</Label>
                                            <Input
                                                id="client_name"
                                                placeholder="e.g. Samantha Cruz"
                                                value={bookingForm.data.client_name}
                                                onChange={(e) => bookingForm.setData('client_name', e.target.value)}
                                                required
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="client_phone">Client Phone</Label>
                                            <Input
                                                id="client_phone"
                                                placeholder="0917XXXXXXX"
                                                value={bookingForm.data.client_phone}
                                                onChange={(e) => bookingForm.setData('client_phone', e.target.value)}
                                                required
                                            />
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <Label htmlFor="event_name">Event Name / Title</Label>
                                        <Input
                                            id="event_name"
                                            placeholder="e.g. Samantha's 18th Debut"
                                            value={bookingForm.data.event_name}
                                            onChange={(e) => bookingForm.setData('event_name', e.target.value)}
                                            required
                                        />
                                    </div>

                                    <div className="grid grid-cols-3 gap-3">
                                        <div className="space-y-2">
                                            <Label htmlFor="event_date">Event Date</Label>
                                            <Input
                                                id="event_date"
                                                type="date"
                                                value={bookingForm.data.event_date}
                                                onChange={(e) => bookingForm.setData('event_date', e.target.value)}
                                                required
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="start_time">Start Time</Label>
                                            <Input
                                                id="start_time"
                                                type="time"
                                                value={bookingForm.data.start_time}
                                                onChange={(e) => bookingForm.setData('start_time', e.target.value)}
                                                required
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="end_time">End Time</Label>
                                            <Input
                                                id="end_time"
                                                type="time"
                                                value={bookingForm.data.end_time}
                                                onChange={(e) => bookingForm.setData('end_time', e.target.value)}
                                                required
                                            />
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                             <Label htmlFor="b_sessions">Sessions Package</Label>
                                            <Select
                                                value={String(bookingForm.data.sessions_count)}
                                                onValueChange={handleBookingSessionsChange}
                                            >
                                                <SelectTrigger id="b_sessions">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="1">1 Session (2 photostrips - ₱100)</SelectItem>
                                                    <SelectItem value="2">2 Sessions (4 photostrips - ₱200)</SelectItem>
                                                    <SelectItem value="3">3 Sessions (6 photostrips - ₱300)</SelectItem>
                                                    <SelectItem value="5">5 Sessions (10 photostrips - ₱500)</SelectItem>
                                                    <SelectItem value="10">10 Sessions (20 photostrips - ₱1,000)</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>

                                        <div className="space-y-2">
                                            <Label htmlFor="b_copies">Extra Copies (₱100/ea = 2 strips)</Label>
                                            <Select
                                                value={String(bookingForm.data.extra_copies)}
                                                onValueChange={(val) => bookingForm.setData('extra_copies', parseInt(val, 10))}
                                            >
                                                <SelectTrigger id="b_copies">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="0">0 Extra Copies</SelectItem>
                                                    <SelectItem value="2">+2 Extra Copies (4 strips - +₱200)</SelectItem>
                                                    <SelectItem value="5">+5 Extra Copies (10 strips - +₱500)</SelectItem>
                                                    <SelectItem value="10">+10 Extra Copies (20 strips - +₱1,000)</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </div>

                                    {/* Templates */}
                                    <div className="space-y-2">
                                        <div className="flex items-center justify-between">
                                            <Label className="text-xs font-semibold">Select Preferred Photostrip Templates</Label>
                                            <span className="text-[11px] font-medium text-[#E50914]">
                                                Select up to {bookingForm.data.sessions_count} template{bookingForm.data.sessions_count > 1 ? 's' : ''} ({bookingForm.data.template_ids.length}/{bookingForm.data.sessions_count})
                                            </span>
                                        </div>
                                        <div className="grid grid-cols-2 gap-2 border rounded-lg p-3">
                                            {templates.map((tpl) => (
                                                <div key={tpl.id} className="flex items-center space-x-2 text-xs">
                                                    <Checkbox
                                                        id={`b-tpl-${tpl.id}`}
                                                        checked={bookingForm.data.template_ids.includes(tpl.id)}
                                                        onCheckedChange={() => handleTemplateToggle(tpl.id)}
                                                    />
                                                    <label htmlFor={`b-tpl-${tpl.id}`} className="cursor-pointer">{tpl.name}</label>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Price Preview */}
                                    <div className="rounded-lg bg-neutral-900 border border-neutral-800 text-white p-3 flex justify-between items-center text-sm font-mono">
                                        <span>Total Booking Amount:</span>
                                        <span className="text-lg font-bold text-[#E50914]">{formatCurrency(bookingTotalPrice)}</span>
                                    </div>

                                    <DialogFooter>
                                        <Button type="button" variant="outline" onClick={() => setIsBookingModalOpen(false)}>Cancel</Button>
                                        <Button type="submit" disabled={bookingForm.processing} className="bg-[#E50914] hover:bg-[#c10712] text-white font-semibold">
                                            Confirm Booking
                                        </Button>
                                    </DialogFooter>
                                </form>
                            </DialogContent>
                        </Dialog>
                    </div>
                </div>

                {/* Main View: Interactive Month Calendar & Details Tabs */}
                <Tabs defaultValue="calendar" className="w-full">
                    <TabsList>
                        <TabsTrigger value="calendar">Monthly Calendar View</TabsTrigger>
                        <TabsTrigger value="booths">Booth Locations ({boothLocations.length})</TabsTrigger>
                        <TabsTrigger value="bookings">Bookings List ({bookings.length})</TabsTrigger>
                    </TabsList>

                    {/* Tab 1: Calendar Grid */}
                    <TabsContent value="calendar" className="mt-4 space-y-4">
                        <Card className="border border-neutral-800 bg-neutral-900">
                            <CardHeader className="flex flex-row items-center justify-between pb-4">
                                <CardTitle className="text-lg font-bold">{monthName}</CardTitle>
                                <div className="flex items-center gap-2">
                                    <Button variant="outline" size="icon" onClick={prevMonth}>
                                        <ChevronLeft className="size-4" />
                                    </Button>
                                    <Button variant="outline" size="sm" onClick={() => setCurrentMonthDate(new Date())}>
                                        Today
                                    </Button>
                                    <Button variant="outline" size="icon" onClick={nextMonth}>
                                        <ChevronRight className="size-4" />
                                    </Button>
                                </div>
                            </CardHeader>
                            <CardContent>
                                {/* Calendar Days Header */}
                                <div className="grid grid-cols-7 gap-1 text-center font-semibold text-xs text-neutral-400 py-2 border-b border-neutral-800">
                                    <div>Sun</div>
                                    <div>Mon</div>
                                    <div>Tue</div>
                                    <div>Wed</div>
                                    <div>Thu</div>
                                    <div>Fri</div>
                                    <div>Sat</div>
                                </div>

                                {/* Calendar Days Cells */}
                                <div className="grid grid-cols-7 gap-1.5 pt-2">
                                    {monthDays.map((day, idx) => {
                                        if (day === null) {
                                            return <div key={`empty-${idx}`} className="h-28 rounded-lg bg-neutral-950/40" />;
                                        }

                                        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

                                        const dayBooths = boothLocations.filter((b) => {
                                            const s = b.start_date.split('T')[0];
                                            const e = b.end_date.split('T')[0];
                                            return dateStr >= s && dateStr <= e;
                                        });

                                        const dayBookings = bookings.filter((bk) => bk.event_date === dateStr);

                                        const hasEvents = dayBooths.length > 0 || dayBookings.length > 0;

                                        return (
                                            <div
                                                key={`day-${day}`}
                                                onClick={() => setSelectedDayEvents({ date: dateStr, booths: dayBooths, bookings: dayBookings })}
                                                className={`h-28 p-2 rounded-lg border border-neutral-800 flex flex-col justify-between cursor-pointer transition-all hover:border-[#E50914] ${
                                                    hasEvents ? 'bg-neutral-950 shadow-sm' : 'bg-neutral-900/40'
                                                }`}
                                            >
                                                <div className="flex justify-between items-center">
                                                    <span className="text-xs font-bold font-mono">{day}</span>
                                                    {dayBookings.length > 0 && (
                                                        <Badge variant="secondary" className="text-[9px] px-1 py-0 bg-[#E50914]/15 text-[#E50914] border border-[#E50914]/30">
                                                            {dayBookings.length} booking
                                                        </Badge>
                                                    )}
                                                </div>

                                                <div className="space-y-1 overflow-y-auto text-[10px]">
                                                    {dayBooths.map((b) => (
                                                        <div key={b.id} className="p-1 rounded bg-[#E50914]/10 text-[#E50914] font-semibold truncate border border-[#E50914]/20">
                                                            <MapPin className="inline size-2.5 mr-0.5" /> {b.name}
                                                        </div>
                                                    ))}
                                                    {dayBookings.map((bk) => (
                                                        <div key={bk.id} className="p-1 rounded bg-amber-500/10 text-amber-400 font-semibold truncate border border-amber-500/20">
                                                            📅 {bk.event_name}
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </CardContent>
                        </Card>
                    </TabsContent>

                    {/* Tab 2: Booth Locations */}
                    <TabsContent value="booths" className="mt-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {boothLocations.map((loc) => (
                                <Card key={loc.id} className="border border-neutral-800 bg-neutral-900">
                                    <CardHeader className="p-4 pb-2">
                                        <div className="flex justify-between items-start">
                                            <CardTitle className="text-base font-bold">{loc.name}</CardTitle>
                                            <Badge className={loc.status === 'active' ? 'bg-[#E50914] text-white' : 'bg-neutral-800 text-neutral-400'}>
                                                {loc.status}
                                            </Badge>
                                        </div>
                                        <CardDescription className="text-xs flex items-center gap-1 mt-1 text-neutral-400">
                                            <MapPin className="size-3 text-neutral-500" /> {loc.address}, {loc.city}
                                        </CardDescription>
                                    </CardHeader>
                                    <CardContent className="p-4 pt-2 space-y-2 text-xs">
                                        <div className="flex justify-between text-neutral-400">
                                            <span>Active Duration:</span>
                                            <span className="font-semibold text-neutral-200">
                                                {loc.start_date.split('T')[0]} to {loc.end_date.split('T')[0]}
                                            </span>
                                        </div>
                                        {loc.notes && <p className="text-neutral-400 italic">{loc.notes}</p>}
                                        <div className="pt-2 flex justify-end">
                                            <Button variant="ghost" size="sm" className="text-destructive h-7 text-xs hover:bg-destructive/10" onClick={() => handleDeleteBooth(loc.id)}>
                                                <Trash2 className="mr-1 size-3" /> Remove
                                            </Button>
                                        </div>
                                    </CardContent>
                                </Card>
                            ))}
                        </div>
                    </TabsContent>

                    {/* Tab 3: Bookings */}
                    <TabsContent value="bookings" className="mt-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {bookings.map((bk) => (
                                <Card key={bk.id} className="border border-neutral-800 bg-neutral-900">
                                    <CardHeader className="p-4 pb-2">
                                        <div className="flex justify-between items-start">
                                            <div>
                                                <Badge variant="outline" className="text-[10px] font-mono mb-1 border-neutral-700 text-neutral-300">{bk.booking_number}</Badge>
                                                <CardTitle className="text-base font-bold">{bk.event_name}</CardTitle>
                                            </div>
                                            <Badge className="bg-[#E50914] text-white">{bk.status}</Badge>
                                        </div>
                                        <CardDescription className="text-xs flex items-center gap-1 mt-1 text-neutral-400">
                                            <Users className="size-3" /> {bk.client_name} ({bk.client_phone})
                                        </CardDescription>
                                    </CardHeader>
                                    <CardContent className="p-4 pt-2 space-y-2 text-xs">
                                        <div className="flex justify-between text-neutral-400">
                                            <span>Date & Time:</span>
                                            <span className="font-semibold text-neutral-200">{bk.event_date} ({bk.start_time} - {bk.end_time})</span>
                                        </div>
                                        <div className="flex justify-between text-neutral-400">
                                            <span>Package Total:</span>
                                            <span className="font-bold text-[#E50914]">{formatCurrency(bk.total_amount)}</span>
                                        </div>
                                        <div className="flex justify-between text-neutral-400">
                                            <span>Deposit Paid:</span>
                                            <span className="font-semibold text-neutral-200">{formatCurrency(bk.deposit_amount)}</span>
                                        </div>
                                        <div className="pt-2 flex justify-end">
                                            <Button variant="ghost" size="sm" className="text-destructive h-7 text-xs hover:bg-destructive/10" onClick={() => handleDeleteBooking(bk.id)}>
                                                <Trash2 className="mr-1 size-3" /> Remove
                                            </Button>
                                        </div>
                                    </CardContent>
                                </Card>
                            ))}
                        </div>
                    </TabsContent>
                </Tabs>
            </div>
        </>
    );
}

CalendarIndex.layout = (page: React.ReactNode) => <AppLayout breadcrumbs={breadcrumbs}>{page}</AppLayout>;
