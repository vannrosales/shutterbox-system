import { FormEvent, useEffect } from 'react';
import { useForm } from '@inertiajs/react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Pencil } from 'lucide-react';

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

interface Props {
    session: QueueSession | null;
    onClose: () => void;
    templates: Template[];
    boothLocations: BoothLocation[];
    formatCurrency: (amount: number) => string;
}

export function EditQueueModal({
    session,
    onClose,
    templates,
    boothLocations,
    formatCurrency,
}: Props) {
    const editForm = useForm({
        customer_name: '',
        booth_location_id: '',
        sessions_count: 1,
        template_ids: [] as number[],
        extra_copies: 0,
        payment_method: 'cash',
        payment_status: 'paid',
        status: 'waiting',
        notes: '',
    });

    useEffect(() => {
        if (session) {
            editForm.setData({
                customer_name: session.customer_name,
                booth_location_id: session.booth_location_id ? String(session.booth_location_id) : '',
                sessions_count: session.sessions_count,
                template_ids: session.templates.map((t) => t.id),
                extra_copies: session.extra_copies,
                payment_method: session.payment_method,
                payment_status: session.payment_status,
                status: session.status,
                notes: session.notes || '',
            });
        }
    }, [session]);

    if (!session) return null;

    const editBasePhotostrips = editForm.data.sessions_count * 2;
    const editExtraPhotostrips = editForm.data.extra_copies * 2;
    const editTotalPhotostrips = editBasePhotostrips + editExtraPhotostrips;
    const editBasePrice = editForm.data.sessions_count * 100;
    const editExtraCopiesPrice = editForm.data.extra_copies * 100;
    const editTotalPrice = editBasePrice + editExtraCopiesPrice;

    const handleEditTemplateToggle = (templateId: number) => {
        const maxAllowed = editForm.data.sessions_count;
        if (editForm.data.template_ids.includes(templateId)) {
            editForm.setData('template_ids', editForm.data.template_ids.filter((id) => id !== templateId));
        } else {
            if (maxAllowed === 1) {
                editForm.setData('template_ids', [templateId]);
            } else if (editForm.data.template_ids.length < maxAllowed) {
                editForm.setData('template_ids', [...editForm.data.template_ids, templateId]);
            } else {
                editForm.setData('template_ids', [...editForm.data.template_ids.slice(1), templateId]);
            }
        }
    };

    const handleEditSessionsCountChange = (val: string) => {
        const newCount = parseInt(val, 10);
        editForm.setData((prevData) => ({
            ...prevData,
            sessions_count: newCount,
            template_ids: prevData.template_ids.slice(0, newCount),
        }));
    };

    const handleEditSubmit = (e: FormEvent) => {
        e.preventDefault();
        editForm.put(`/queuing/${session.id}`, {
            onSuccess: () => {
                onClose();
            },
        });
    };

    return (
        <Dialog open={!!session} onOpenChange={onClose}>
            <DialogContent className="max-w-lg border border-neutral-800 bg-neutral-950 text-white p-6 rounded-2xl shadow-2xl">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-lg font-bold tracking-tight">
                        <Pencil className="size-5 text-[#E50914]" /> Edit Queue Ticket {session.queue_number}
                    </DialogTitle>
                    <DialogDescription className="text-xs text-neutral-400">
                        Modify customer details, sessions, photostrip templates, and payment info.
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleEditSubmit} className="space-y-4 py-2">
                    {/* Customer Name & Location */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <Label htmlFor="edit_customer_name" className="text-xs font-medium text-neutral-300">Customer Name</Label>
                            <Input
                                id="edit_customer_name"
                                placeholder="Guest / Group name"
                                value={editForm.data.customer_name}
                                onChange={(e) => editForm.setData('customer_name', e.target.value)}
                                className="h-9 text-xs bg-neutral-900 border-neutral-800 focus:border-[#E50914]"
                            />
                        </div>

                        <div className="space-y-1.5">
                            <Label htmlFor="edit_booth_location" className="text-xs font-medium text-neutral-300">Booth Location</Label>
                            <Select
                                value={String(editForm.data.booth_location_id)}
                                onValueChange={(val) => editForm.setData('booth_location_id', val)}
                            >
                                <SelectTrigger id="edit_booth_location" className="h-9 text-xs bg-neutral-900 border-neutral-800">
                                    <SelectValue placeholder="Select Location" />
                                </SelectTrigger>
                                <SelectContent className="bg-neutral-900 border-neutral-800">
                                    {boothLocations.map((loc) => (
                                        <SelectItem key={loc.id} value={String(loc.id)}>
                                            {loc.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    {/* Queue Status & Sessions */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <Label htmlFor="edit_status" className="text-xs font-medium text-neutral-300">Queue Status</Label>
                            <Select
                                value={editForm.data.status}
                                onValueChange={(val) => editForm.setData('status', val)}
                            >
                                <SelectTrigger id="edit_status" className="h-9 text-xs bg-neutral-900 border-neutral-800">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="bg-neutral-900 border-neutral-800">
                                    <SelectItem value="waiting">Waiting</SelectItem>
                                    <SelectItem value="in_booth">In Booth</SelectItem>
                                    <SelectItem value="completed">Completed</SelectItem>
                                    <SelectItem value="cancelled">Cancelled</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-1.5">
                            <Label htmlFor="edit_sessions_count" className="text-xs font-medium text-neutral-300">Sessions</Label>
                            <Select
                                value={String(editForm.data.sessions_count)}
                                onValueChange={handleEditSessionsCountChange}
                            >
                                <SelectTrigger id="edit_sessions_count" className="h-9 text-xs bg-neutral-900 border-neutral-800">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="bg-neutral-900 border-neutral-800">
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
                    </div>

                    {/* Templates Selection */}
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <Label className="text-xs font-medium text-neutral-300">
                                Select Templates
                            </Label>
                            <span className="text-[11px] font-medium text-[#E50914]">
                                Select up to {editForm.data.sessions_count} template{editForm.data.sessions_count > 1 ? 's' : ''} ({editForm.data.template_ids.length}/{editForm.data.sessions_count})
                            </span>
                        </div>

                        {templates.length === 0 ? (
                            <p className="text-xs text-neutral-400">No active templates found.</p>
                        ) : (
                            <div className="grid grid-cols-2 gap-2">
                                {templates.map((tpl) => {
                                    const isChecked = editForm.data.template_ids.includes(tpl.id);
                                    return (
                                        <div
                                            key={tpl.id}
                                            onClick={() => handleEditTemplateToggle(tpl.id)}
                                            className={`flex items-center space-x-2.5 p-2.5 rounded-lg border cursor-pointer transition-all ${
                                                isChecked ? 'border-[#E50914] bg-[#E50914]/10' : 'border-neutral-800 bg-neutral-900/60 hover:border-neutral-700'
                                            }`}
                                        >
                                            <Checkbox
                                                id={`edit-template-${tpl.id}`}
                                                checked={isChecked}
                                                onCheckedChange={() => handleEditTemplateToggle(tpl.id)}
                                                className="border-neutral-600 data-[state=checked]:bg-[#E50914] data-[state=checked]:border-[#E50914]"
                                            />
                                            <div className="grid leading-tight truncate">
                                                <label
                                                    htmlFor={`edit-template-${tpl.id}`}
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
                        {editForm.errors.template_ids && (
                            <p className="text-xs text-red-500">{editForm.errors.template_ids}</p>
                        )}
                    </div>

                    {/* Extra Copies */}
                    <div className="space-y-1.5">
                        <div className="flex justify-between items-center">
                            <Label htmlFor="edit_extra_copies" className="text-xs font-medium text-neutral-300">
                                Extra Copies <span className="text-neutral-500 font-normal">(Optional)</span>
                            </Label>
                            <span className="text-[11px] text-neutral-400 font-mono">
                                +₱100 per copy set (2 strips)
                            </span>
                        </div>
                        <Select
                            value={String(editForm.data.extra_copies)}
                            onValueChange={(val) => editForm.setData('extra_copies', parseInt(val, 10))}
                        >
                            <SelectTrigger id="edit_extra_copies" className="h-9 text-xs bg-neutral-900 border-neutral-800">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="bg-neutral-900 border-neutral-800">
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
                            <Label htmlFor="edit_payment_method" className="text-xs font-medium text-neutral-300">Payment Method</Label>
                            <Select
                                value={editForm.data.payment_method}
                                onValueChange={(val) => editForm.setData('payment_method', val)}
                            >
                                <SelectTrigger id="edit_payment_method" className="h-9 text-xs bg-neutral-900 border-neutral-800">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="bg-neutral-900 border-neutral-800">
                                    <SelectItem value="cash">Cash</SelectItem>
                                    <SelectItem value="gcash">GCash</SelectItem>
                                    <SelectItem value="maya">Maya</SelectItem>
                                    <SelectItem value="card">Card / POS</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-1.5">
                            <Label htmlFor="edit_payment_status" className="text-xs font-medium text-neutral-300">Payment Status</Label>
                            <Select
                                value={editForm.data.payment_status}
                                onValueChange={(val) => editForm.setData('payment_status', val)}
                            >
                                <SelectTrigger id="edit_payment_status" className="h-9 text-xs bg-neutral-900 border-neutral-800">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="bg-neutral-900 border-neutral-800">
                                    <SelectItem value="paid">Paid</SelectItem>
                                    <SelectItem value="pending">Pending</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    {/* Order Summary */}
                    <div className="rounded-xl bg-neutral-900/80 border border-neutral-800 p-3.5 space-y-1.5 text-xs">
                        <div className="flex justify-between text-neutral-400">
                            <span>Sessions ({editForm.data.sessions_count}):</span>
                            <span className="font-mono text-neutral-200">{formatCurrency(editBasePrice)}</span>
                        </div>
                        {editForm.data.extra_copies > 0 && (
                            <div className="flex justify-between text-neutral-400">
                                <span>Extra Copies ({editForm.data.extra_copies}):</span>
                                <span className="font-mono text-neutral-200">+{formatCurrency(editExtraCopiesPrice)}</span>
                            </div>
                        )}
                        <div className="flex justify-between text-neutral-400">
                            <span>Total Photostrips:</span>
                            <span className="font-mono text-neutral-200">{editTotalPhotostrips} strips</span>
                        </div>
                        <div className="pt-2 border-t border-neutral-800 flex justify-between items-center">
                            <span className="font-semibold text-neutral-200">Total Price</span>
                            <span className="text-xl font-extrabold text-[#E50914] font-mono">{formatCurrency(editTotalPrice)}</span>
                        </div>
                    </div>

                    <DialogFooter className="pt-2 gap-2">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={onClose}
                            className="h-9 text-xs border-neutral-800 text-neutral-400 hover:bg-neutral-800"
                        >
                            Cancel
                        </Button>
                        <Button
                            type="submit"
                            disabled={editForm.processing || editForm.data.template_ids.length === 0}
                            className="h-9 text-xs bg-[#E50914] text-white font-semibold hover:bg-[#c10712] px-5"
                        >
                            Save Changes
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
