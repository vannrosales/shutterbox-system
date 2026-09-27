import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Printer, QrCode } from 'lucide-react';

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
    formatCurrency: (amount: number) => string;
}

export function ReceiptModal({ session, onClose, formatCurrency }: Props) {
    if (!session) return null;

    return (
        <Dialog open={!!session} onOpenChange={onClose}>
            <DialogContent className="max-w-md bg-white text-neutral-900 border border-neutral-200">
                <DialogHeader>
                    <DialogTitle className="text-center text-lg font-bold">ShutterBox Queue Receipt</DialogTitle>
                </DialogHeader>

                <div className="p-6 bg-white text-neutral-900 font-mono rounded-xl border border-neutral-200 space-y-4 shadow-inner text-sm">
                    <div className="text-center border-b pb-3 border-neutral-200">
                        <h2 className="font-bold text-xl tracking-wider uppercase">SHUTTERBOX PHOTOBOOTH</h2>
                        <p className="text-xs text-neutral-500">Official Queue & Session Ticket</p>
                    </div>

                    <div className="text-center py-2 bg-neutral-100 rounded-lg">
                        <span className="text-xs uppercase text-neutral-500 block">Queue Ticket Number</span>
                        <span className="text-3xl font-extrabold text-neutral-900">{session.queue_number}</span>
                    </div>

                    <div className="space-y-1.5 text-xs">
                        <div className="flex justify-between">
                            <span className="text-neutral-500">Customer Name:</span>
                            <span className="font-semibold">{session.customer_name}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-neutral-500">Sessions Count:</span>
                            <span>{session.sessions_count} session(s)</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-neutral-500">Base Photostrips (1 sess = 2 strips):</span>
                            <span>{session.photostrips_base_count} strips</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-neutral-500">Extra Copies (+₱100/ea = 2 strips):</span>
                            <span>{session.extra_copies} copy set(s) ({session.extra_copies * 2} strips)</span>
                        </div>
                        <div className="flex justify-between font-bold text-neutral-900 pt-1 border-t border-neutral-200">
                            <span>Total Photostrips:</span>
                            <span>{session.total_photostrips} strips</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-neutral-500">Selected Templates:</span>
                            <span className="font-semibold text-right">
                                {session.templates.map((t) => t.name).join(', ') || 'Standard'}
                            </span>
                        </div>
                        <div className="flex justify-between border-t border-neutral-200 pt-2 font-bold text-base text-neutral-900">
                            <span>Total Paid ({session.payment_method.toUpperCase()}):</span>
                            <span>{formatCurrency(session.total_price)}</span>
                        </div>
                    </div>

                    <div className="border-t border-neutral-200 pt-4 text-center space-y-2">
                        <div className="size-20 bg-neutral-100 mx-auto rounded-lg flex items-center justify-center border border-neutral-200">
                            <QrCode className="size-14 text-neutral-800" />
                        </div>
                        <p className="text-[10px] text-neutral-400 uppercase tracking-widest">Scan code at booth entry screen</p>
                    </div>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                    <Button variant="outline" onClick={onClose}>Close</Button>
                    <Button onClick={() => window.print()} className="bg-[#E50914] text-white hover:bg-[#c10712]">
                        <Printer className="mr-2 size-4" /> Print Ticket
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
