import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, FastForward, Pencil, Printer, Trash2 } from 'lucide-react';

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
    session: QueueSession;
    onEdit: (session: QueueSession) => void;
    onPrintReceipt: (session: QueueSession) => void;
    onStatusUpdate: (sessionId: number, status: string) => void;
    onDelete: (sessionId: number) => void;
    formatCurrency: (amount: number) => string;
}

export function QueueCard({
    session,
    onEdit,
    onPrintReceipt,
    onStatusUpdate,
    onDelete,
    formatCurrency,
}: Props) {
    return (
        <Card className="relative overflow-hidden flex flex-col justify-between border border-neutral-800 shadow-sm bg-neutral-950 text-white">
            {/* Top Ticket Ribbon */}
            <div className="p-4 border-b border-neutral-800 bg-neutral-900/60 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <span className="font-mono text-base font-bold bg-neutral-950 text-[#E50914] border border-[#E50914]/30 px-3 py-1 rounded-md">
                        {session.queue_number}
                    </span>
                    <Badge className={
                        session.status === 'completed' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' :
                        session.status === 'skipped' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' :
                        session.status === 'cancelled' ? 'bg-red-500/10 text-red-500 border-red-500/20' :
                        'bg-[#E50914]/10 text-[#E50914] border-[#E50914]/20'
                    }>
                        {session.status === 'waiting' ? 'WAITING QUEUE' : session.status.replace('_', ' ').toUpperCase()}
                    </Badge>
                </div>

                <div className="flex items-center gap-1">
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => onEdit(session)}
                        title="Edit Queue Ticket"
                        className="text-neutral-400 hover:text-white"
                    >
                        <Pencil className="size-4" />
                    </Button>
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => onPrintReceipt(session)}
                        title="Print Receipt / Ticket"
                        className="text-neutral-400 hover:text-white"
                    >
                        <Printer className="size-4" />
                    </Button>
                </div>
            </div>

            <CardContent className="p-4 space-y-3 flex-1">
                <div>
                    <h3 className="font-bold text-base text-neutral-100">{session.customer_name}</h3>
                    {session.booth_location && (
                        <p className="text-xs text-neutral-400">{session.booth_location.name}</p>
                    )}
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs border border-neutral-800 rounded-lg p-2.5 bg-neutral-900/50">
                    <div>
                        <span className="text-neutral-400 block">Sessions Count:</span>
                        <span className="font-semibold text-neutral-200">{session.sessions_count} session(s)</span>
                    </div>
                    <div>
                        <span className="text-neutral-400 block">Photostrips:</span>
                        <span className="font-semibold text-[#E50914]">
                            {session.total_photostrips} strips total
                        </span>
                    </div>
                    <div>
                        <span className="text-neutral-400 block">Extra Copies:</span>
                        <span className="font-semibold text-neutral-200">+{session.extra_copies} ({session.extra_copies * 2} strips)</span>
                    </div>
                    <div>
                        <span className="text-neutral-400 block">Total Amount:</span>
                        <span className="font-bold text-emerald-400">{formatCurrency(session.total_price)}</span>
                    </div>
                </div>

                {/* Templates Chosen */}
                <div>
                    <span className="text-[11px] font-semibold text-neutral-400 block mb-1">Templates Chosen:</span>
                    <div className="flex flex-wrap gap-1">
                        {session.templates.length === 0 ? (
                            <span className="text-xs text-neutral-500 italic">Standard</span>
                        ) : (
                            session.templates.map((tpl) => (
                                <Badge key={tpl.id} variant="secondary" className="text-[10px] font-normal bg-neutral-800 text-neutral-200 border-neutral-700">
                                    {tpl.name}
                                </Badge>
                            ))
                        )}
                    </div>
                </div>
            </CardContent>

            {/* Action Bar */}
            <div className="p-3 border-t border-neutral-800 bg-neutral-900/40 flex items-center justify-between gap-2 flex-wrap">
                <div className="flex gap-1.5 flex-wrap">
                    {(session.status === 'waiting' || session.status === 'skipped') && (
                        <Button
                            size="sm"
                            className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs h-8"
                            onClick={() => onStatusUpdate(session.id, 'completed')}
                        >
                            <CheckCircle2 className="mr-1 size-3.5" /> Mark Completed
                        </Button>
                    )}

                    {(session.status === 'waiting') && (
                        <Button
                            size="sm"
                            variant="outline"
                            className="border-amber-500/40 text-amber-400 hover:bg-amber-500/10 font-medium text-xs h-8"
                            onClick={() => onStatusUpdate(session.id, 'skipped')}
                            title="Client left or unresponsive - skip to next queue entry"
                        >
                            <FastForward className="mr-1 size-3.5" /> Skip
                        </Button>
                    )}
                </div>

                <Button
                    variant="ghost"
                    size="icon"
                    className="size-8 text-red-400 hover:bg-red-500/10 hover:text-red-300 ml-auto"
                    onClick={() => onDelete(session.id)}
                >
                    <Trash2 className="size-4" />
                </Button>
            </div>
        </Card>
    );
}
