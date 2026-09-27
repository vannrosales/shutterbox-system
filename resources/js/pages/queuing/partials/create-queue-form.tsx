import { FormEvent } from 'react';
import { useForm } from '@inertiajs/react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sparkles, Ticket } from 'lucide-react';

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

interface Props {
    templates: Template[];
    boothLocations: BoothLocation[];
    formatCurrency: (amount: number) => string;
}

export function CreateQueueForm({
    templates,
    boothLocations,
    formatCurrency,
}: Props) {
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

    const basePhotostrips = data.sessions_count * 2;
    const extraPhotostrips = data.extra_copies * 2;
    const totalPhotostrips = basePhotostrips + extraPhotostrips;
    const basePrice = data.sessions_count * 100;
    const extraCopiesPrice = data.extra_copies * 100;
    const totalPrice = basePrice + extraCopiesPrice;

    const handleTemplateToggle = (templateId: number) => {
        const maxAllowed = data.sessions_count;
        if (data.template_ids.includes(templateId)) {
            setData('template_ids', data.template_ids.filter((id) => id !== templateId));
        } else {
            if (maxAllowed === 1) {
                setData('template_ids', [templateId]);
            } else if (data.template_ids.length < maxAllowed) {
                setData('template_ids', [...data.template_ids, templateId]);
            } else {
                setData('template_ids', [...data.template_ids.slice(1), templateId]);
            }
        }
    };

    const handleSessionsCountChange = (val: string) => {
        const newCount = parseInt(val, 10);
        setData((prevData) => ({
            ...prevData,
            sessions_count: newCount,
            template_ids: prevData.template_ids.slice(0, newCount),
        }));
    };

    const handleSubmit = (e: FormEvent) => {
        e.preventDefault();
        post('/queuing', {
            onSuccess: () => {
                reset();
            },
        });
    };

    return (
        <Card className="border-neutral-800 bg-neutral-950 text-white shadow-xl py-5">
            <CardHeader className="pb-4">
                <CardTitle className="flex items-center gap-2 text-lg font-bold tracking-tight text-white">
                    <Sparkles className="size-5 text-[#E50914]" /> Create Queue Ticket
                </CardTitle>
                <CardDescription className="text-xs text-neutral-400">
                    Process walk-in session, select template, and calculate price.
                </CardDescription>
            </CardHeader>

            <CardContent>
                <form onSubmit={handleSubmit} className="space-y-4">
                    {/* Customer Name & Location */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <Label htmlFor="customer_name" className="text-xs font-medium text-neutral-300">
                                Customer Name
                            </Label>
                            <Input
                                id="customer_name"
                                placeholder="Guest / Group name"
                                value={data.customer_name}
                                onChange={(e) => setData('customer_name', e.target.value)}
                                className="h-9 text-xs bg-neutral-900 border-neutral-800 focus:border-[#E50914] text-white"
                            />
                        </div>

                        <div className="space-y-1.5">
                            <Label htmlFor="booth_location" className="text-xs font-medium text-neutral-300">
                                Booth Location
                            </Label>
                            <Select
                                value={String(data.booth_location_id)}
                                onValueChange={(val) => setData('booth_location_id', val)}
                            >
                                <SelectTrigger id="booth_location" className="h-9 text-xs bg-neutral-900 border-neutral-800 text-white">
                                    <SelectValue placeholder="Select Location" />
                                </SelectTrigger>
                                <SelectContent className="bg-neutral-900 border-neutral-800 text-white">
                                    {boothLocations.map((loc) => (
                                        <SelectItem key={loc.id} value={String(loc.id)}>
                                            {loc.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    {/* Sessions Dropdown */}
                    <div className="space-y-1.5">
                        <div className="flex justify-between items-center">
                            <Label htmlFor="sessions_count" className="text-xs font-medium text-neutral-300">
                                Sessions
                            </Label>
                            <span className="text-[11px] text-neutral-400 font-mono">
                                ₱100 / session (2 strips)
                            </span>
                        </div>
                        <Select
                            value={String(data.sessions_count)}
                            onValueChange={handleSessionsCountChange}
                        >
                            <SelectTrigger id="sessions_count" className="h-9 text-xs bg-neutral-900 border-neutral-800 text-white">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="bg-neutral-900 border-neutral-800 text-white">
                                <SelectItem value="1">1 Session (2 strips - ₱100)</SelectItem>
                                <SelectItem value="2">2 Sessions (4 strips - ₱200)</SelectItem>
                                <SelectItem value="3">3 Sessions (6 strips - ₱300)</SelectItem>
                                <SelectItem value="4">4 Sessions (8 strips - ₱400)</SelectItem>
                                <SelectItem value="5">5 Sessions (10 strips - ₱500)</SelectItem>
                                <SelectItem value="6">6 Sessions (12 strips - ₱600)</SelectItem>
                                <SelectItem value="8">8 Sessions (16 strips - ₱800)</SelectItem>
                                <SelectItem value="10">10 Sessions (20 strips - ₱1,000)</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Templates Selection */}
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <Label className="text-xs font-medium text-neutral-300">
                                Select Templates
                            </Label>
                            <span className="text-[11px] font-medium text-[#E50914]">
                                Select up to {data.sessions_count} template{data.sessions_count > 1 ? 's' : ''} ({data.template_ids.length}/{data.sessions_count})
                            </span>
                        </div>

                        {templates.length === 0 ? (
                            <p className="text-xs text-neutral-400">No active templates found.</p>
                        ) : (
                            <div className="grid grid-cols-2 gap-2">
                                {templates.map((tpl) => {
                                    const isChecked = data.template_ids.includes(tpl.id);
                                    return (
                                        <div
                                            key={tpl.id}
                                            onClick={() => handleTemplateToggle(tpl.id)}
                                            className={`flex items-center space-x-2.5 p-2.5 rounded-lg border cursor-pointer transition-all ${
                                                isChecked ? 'border-[#E50914] bg-[#E50914]/10' : 'border-neutral-800 bg-neutral-900/60 hover:border-neutral-700'
                                            }`}
                                        >
                                            <Checkbox
                                                id={`template-${tpl.id}`}
                                                checked={isChecked}
                                                onCheckedChange={() => handleTemplateToggle(tpl.id)}
                                                className="border-neutral-600 data-[state=checked]:bg-[#E50914] data-[state=checked]:border-[#E50914]"
                                            />
                                            <div className="grid leading-tight truncate">
                                                <label
                                                    htmlFor={`template-${tpl.id}`}
                                                    className="text-xs font-semibold cursor-pointer truncate"
                                                >
                                                    {tpl.name}
                                                </label>
                                                <span className="text-[10px] text-neutral-400 truncate">
                                                    {tpl.category}
                                                </span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                        {errors.template_ids && (
                            <p className="text-xs text-red-500">{errors.template_ids}</p>
                        )}
                    </div>

                    {/* Extra Copies */}
                    <div className="space-y-1.5">
                        <div className="flex justify-between items-center">
                            <Label htmlFor="extra_copies" className="text-xs font-medium text-neutral-300">
                                Extra Copies <span className="text-neutral-500 font-normal">(Optional)</span>
                            </Label>
                            <span className="text-[11px] text-neutral-400 font-mono">
                                +₱100 per copy set (2 strips)
                            </span>
                        </div>
                        <Select
                            value={String(data.extra_copies)}
                            onValueChange={(val) => setData('extra_copies', parseInt(val, 10))}
                        >
                            <SelectTrigger id="extra_copies" className="h-9 text-xs bg-neutral-900 border-neutral-800 text-white">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="bg-neutral-900 border-neutral-800 text-white">
                                <SelectItem value="0">0 Extra Copies</SelectItem>
                                <SelectItem value="1">+1 Copy Set (+2 strips - +₱100)</SelectItem>
                                <SelectItem value="2">+2 Copy Sets (+4 strips - +₱200)</SelectItem>
                                <SelectItem value="3">+3 Copy Sets (+6 strips - +₱300)</SelectItem>
                                <SelectItem value="4">+4 Copy Sets (+8 strips - +₱400)</SelectItem>
                                <SelectItem value="5">+5 Copy Sets (+10 strips - +₱500)</SelectItem>
                                <SelectItem value="6">+6 Copy Sets (+12 strips - +₱600)</SelectItem>
                                <SelectItem value="8">+8 Copy Sets (+16 strips - +₱800)</SelectItem>
                                <SelectItem value="10">+10 Copy Sets (+20 strips - +₱1,000)</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Payment Method & Status */}
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <Label htmlFor="payment_method" className="text-xs font-medium text-neutral-300">
                                Payment Method
                            </Label>
                            <Select
                                value={data.payment_method}
                                onValueChange={(val) => setData('payment_method', val)}
                            >
                                <SelectTrigger id="payment_method" className="h-9 text-xs bg-neutral-900 border-neutral-800 text-white">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="bg-neutral-900 border-neutral-800 text-white">
                                    <SelectItem value="cash">Cash</SelectItem>
                                    <SelectItem value="gcash">GCash</SelectItem>
                                    <SelectItem value="maya">Maya</SelectItem>
                                    <SelectItem value="card">Card / POS</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-1.5">
                            <Label htmlFor="payment_status" className="text-xs font-medium text-neutral-300">
                                Payment Status
                            </Label>
                            <Select
                                value={data.payment_status}
                                onValueChange={(val) => setData('payment_status', val)}
                            >
                                <SelectTrigger id="payment_status" className="h-9 text-xs bg-neutral-900 border-neutral-800 text-white">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="bg-neutral-900 border-neutral-800 text-white">
                                    <SelectItem value="paid">Paid</SelectItem>
                                    <SelectItem value="pending">Pending</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    {/* Order Summary Box */}
                    <div className="rounded-xl bg-neutral-900/80 border border-neutral-800 p-3.5 space-y-1.5 text-xs">
                        <div className="flex justify-between text-neutral-400">
                            <span>Sessions ({data.sessions_count}):</span>
                            <span className="font-mono text-neutral-200">{formatCurrency(basePrice)}</span>
                        </div>
                        {data.extra_copies > 0 && (
                            <div className="flex justify-between text-neutral-400">
                                <span>Extra Copies ({data.extra_copies}):</span>
                                <span className="font-mono text-neutral-200">+{formatCurrency(extraCopiesPrice)}</span>
                            </div>
                        )}
                        <div className="flex justify-between text-neutral-400">
                            <span>Total Photostrips:</span>
                            <span className="font-mono text-neutral-200">{totalPhotostrips} strips</span>
                        </div>
                        <div className="pt-2 border-t border-neutral-800 flex justify-between items-center">
                            <span className="font-semibold text-neutral-200">Total Price</span>
                            <span className="text-xl font-extrabold text-[#E50914] font-mono">{formatCurrency(totalPrice)}</span>
                        </div>
                    </div>

                    <Button
                        type="submit"
                        disabled={processing || data.template_ids.length === 0}
                        className="w-full h-10 text-xs bg-[#E50914] text-white font-semibold hover:bg-[#c10712] shadow-md transition-colors"
                    >
                        <Ticket className="mr-2 size-4" /> Issue Queue Ticket
                    </Button>
                </form>
            </CardContent>
        </Card>
    );
}
