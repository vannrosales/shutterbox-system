import React, { useState, useEffect, FormEvent } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import CreativeSevenLogo from '@/components/creative-seven-logo';
import { Calendar, DollarSign, Sparkles, TrendingUp, CheckCircle2, Loader2, ArrowRight } from 'lucide-react';

export interface SetupData {
    eventName: string;
    totalRevenue: number;
    dateFrom: string;
    dateTo: string;
}

interface FirstTimeSetupModalProps {
    isOpen: boolean;
    onComplete: (data: SetupData) => void;
}

export default function FirstTimeSetupModal({ isOpen, onComplete }: FirstTimeSetupModalProps) {
    const defaultStartStr = '2026-09-24';
    const defaultEndStr = '2026-09-27';

    const [eventName, setEventName] = useState('RTR - Foundation Days');
    const [revenueInput, setRevenueInput] = useState('10000');
    const [dateFrom, setDateFrom] = useState(defaultStartStr);
    const [dateTo, setDateTo] = useState(defaultEndStr);

    const [isCalculating, setIsCalculating] = useState(false);
    const [progress, setProgress] = useState(0);
    const [loadingStage, setLoadingStage] = useState('');

    const parsedRevenue = Math.max(0, parseFloat(revenueInput) || 0);
    const completedSessions = Math.floor(parsedRevenue / 100);
    const completedPhotostrips = completedSessions * 2;

    const calculateDays = () => {
        if (!dateFrom || !dateTo) return 1;
        const start = new Date(dateFrom).getTime();
        const end = new Date(dateTo).getTime();
        const diffDays = Math.ceil((end - start) / (1000 * 3600 * 24)) + 1;
        return diffDays > 0 ? diffDays : 1;
    };

    const daysCount = calculateDays();
    const dailyAverage = Math.round((parsedRevenue / daysCount) * 100) / 100;

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(amount);
    };

    const handleSubmit = (e: FormEvent) => {
        e.preventDefault();
        setIsCalculating(true);
        setProgress(0);
    };

    useEffect(() => {
        if (!isCalculating) return;

        const stages = [
            { pct: 20, label: 'Reading existing event dates and venue parameters...' },
            { pct: 45, label: `Processing event duration (${daysCount} days)...` },
            { pct: 70, label: `Calculating photostrip sessions completed (${completedSessions} sessions = ${completedPhotostrips} strips)...` },
            { pct: 90, label: `Syncing total event revenue (${formatCurrency(parsedRevenue)})...` },
            { pct: 100, label: 'Event data initialized! Opening POS...' },
        ];

        let stageIdx = 0;
        const interval = setInterval(() => {
            if (stageIdx < stages.length) {
                setProgress(stages[stageIdx].pct);
                setLoadingStage(stages[stageIdx].label);
                stageIdx++;
            } else {
                clearInterval(interval);
                setTimeout(() => {
                    setIsCalculating(false);
                    onComplete({
                        eventName,
                        totalRevenue: parsedRevenue,
                        dateFrom,
                        dateTo,
                    });
                }, 400);
            }
        }, 500);

        return () => clearInterval(interval);
    }, [isCalculating, daysCount, completedSessions, completedPhotostrips, parsedRevenue, eventName, dateFrom, dateTo, onComplete]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/90 backdrop-blur-md p-4 overflow-y-auto">
            <div className="w-full max-w-xl bg-neutral-950 border border-neutral-800 rounded-3xl shadow-2xl p-6 md:p-8 text-white relative overflow-hidden">
                {/* Background Red Glow Accent */}
                <div className="absolute top-0 right-0 w-80 h-80 bg-[#E50914]/15 rounded-full blur-3xl pointer-events-none" />

                {/* Header Logo & Title */}
                <div className="flex flex-col items-center text-center space-y-3 mb-6">
                    <CreativeSevenLogo variant="image" size="md" className="w-48 h-auto mb-1" />
                    <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#E50914]/10 border border-[#E50914]/30 text-[#E50914] text-xs font-semibold uppercase tracking-wider">
                        <Sparkles className="size-3.5" /> Initial Event Entry
                    </div>
                    <h2 className="text-2xl font-bold tracking-tight text-white">Event Revenue & Date Initialization</h2>
                    <p className="text-xs text-neutral-400 max-w-md">
                        Enter existing event details, total revenue achieved, and date range to initialize your photo booth data.
                    </p>
                </div>

                {!isCalculating ? (
                    <form onSubmit={handleSubmit} className="space-y-5">
                        {/* Event Name */}
                        <div className="space-y-1.5">
                            <Label htmlFor="setup_event_name" className="text-xs font-medium text-neutral-300 flex items-center gap-1.5">
                                <Sparkles className="size-3.5 text-[#E50914]" /> Event / Booth Location Name
                            </Label>
                            <Input
                                id="setup_event_name"
                                placeholder="e.g. RTR - Foundation Days"
                                value={eventName}
                                onChange={(e) => setEventName(e.target.value)}
                                required
                                className="h-10 text-xs bg-neutral-900 border-neutral-800 focus:border-[#E50914] text-white"
                            />
                        </div>

                        {/* Total Revenue Input */}
                        <div className="space-y-1.5">
                            <div className="flex justify-between items-center">
                                <Label htmlFor="setup_revenue" className="text-xs font-medium text-neutral-300 flex items-center gap-1.5">
                                    <DollarSign className="size-3.5 text-emerald-400" /> Total Event Revenue (₱)
                                </Label>
                                <span className="text-[11px] text-neutral-400 font-mono">
                                    ₱100 / session (2 strips)
                                </span>
                            </div>
                            <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 text-xs font-bold font-mono">₱</span>
                                <Input
                                    id="setup_revenue"
                                    type="number"
                                    min="0"
                                    step="100"
                                    placeholder="10000"
                                    value={revenueInput}
                                    onChange={(e) => setRevenueInput(e.target.value)}
                                    required
                                    className="h-10 pl-7 text-xs bg-neutral-900 border-neutral-800 focus:border-[#E50914] text-white font-mono font-bold"
                                />
                            </div>
                        </div>

                        {/* Date From & Date To */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                                <Label htmlFor="setup_date_from" className="text-xs font-medium text-neutral-300 flex items-center gap-1.5">
                                    <Calendar className="size-3.5 text-blue-400" /> Date From
                                </Label>
                                <Input
                                    id="setup_date_from"
                                    type="date"
                                    value={dateFrom}
                                    onChange={(e) => setDateFrom(e.target.value)}
                                    required
                                    className="h-10 text-xs bg-neutral-900 border-neutral-800 focus:border-[#E50914] text-white"
                                />
                            </div>

                            <div className="space-y-1.5">
                                <Label htmlFor="setup_date_to" className="text-xs font-medium text-neutral-300 flex items-center gap-1.5">
                                    <Calendar className="size-3.5 text-blue-400" /> Date To
                                </Label>
                                <Input
                                    id="setup_date_to"
                                    type="date"
                                    value={dateTo}
                                    onChange={(e) => setDateTo(e.target.value)}
                                    required
                                    className="h-10 text-xs bg-neutral-900 border-neutral-800 focus:border-[#E50914] text-white"
                                />
                            </div>
                        </div>

                        {/* Live Derived Projections Box */}
                        <div className="rounded-2xl bg-neutral-900/90 border border-neutral-800 p-4 space-y-2 text-xs">
                            <div className="flex items-center justify-between text-neutral-400 border-b border-neutral-800 pb-2">
                                <span className="font-semibold text-neutral-200">Event Duration:</span>
                                <span className="font-mono text-white font-bold">{daysCount} Day(s)</span>
                            </div>
                            <div className="grid grid-cols-2 gap-2 pt-1">
                                <div>
                                    <span className="text-neutral-400 block text-[11px]">Sessions Completed:</span>
                                    <span className="font-semibold text-neutral-200">{completedSessions} sessions</span>
                                </div>
                                <div>
                                    <span className="text-neutral-400 block text-[11px]">Total Photostrips:</span>
                                    <span className="font-bold text-[#E50914]">{completedPhotostrips} strips</span>
                                </div>
                                <div>
                                    <span className="text-neutral-400 block text-[11px]">Daily Average:</span>
                                    <span className="font-mono text-emerald-400 font-bold">{formatCurrency(dailyAverage)} / day</span>
                                </div>
                                <div>
                                    <span className="text-neutral-400 block text-[11px]">Total Event Revenue:</span>
                                    <span className="font-extrabold text-emerald-400 font-mono text-sm">{formatCurrency(parsedRevenue)}</span>
                                </div>
                            </div>
                        </div>

                        <Button
                            type="submit"
                            className="w-full h-11 text-xs bg-[#E50914] hover:bg-[#c10712] text-white font-bold tracking-wide uppercase shadow-lg shadow-[#E50914]/20 transition-all rounded-xl"
                        >
                            Process Event Revenue & Launch App <ArrowRight className="ml-2 size-4" />
                        </Button>
                    </form>
                ) : (
                    /* Loading State Animation for Revenue Calculation */
                    <div className="py-8 space-y-6 text-center">
                        <div className="relative size-20 mx-auto flex items-center justify-center">
                            <div className="absolute inset-0 rounded-full border-4 border-neutral-800 border-t-[#E50914] animate-spin" />
                            <TrendingUp className="size-8 text-[#E50914] animate-bounce" />
                        </div>

                        <div className="space-y-2">
                            <h3 className="text-lg font-bold text-white tracking-tight">
                                Processing Existing Event Revenue & Data
                            </h3>
                            <p className="text-xs text-neutral-400 font-mono transition-all animate-pulse">
                                {loadingStage}
                            </p>
                        </div>

                        {/* Progress Bar */}
                        <div className="space-y-1.5 max-w-md mx-auto">
                            <div className="w-full bg-neutral-900 border border-neutral-800 rounded-full h-3 overflow-hidden p-0.5">
                                <div
                                    className="bg-gradient-to-r from-[#E50914] to-emerald-500 h-full rounded-full transition-all duration-300 ease-out"
                                    style={{ width: `${progress}%` }}
                                />
                            </div>
                            <div className="flex justify-between items-center text-[10px] font-mono text-neutral-400">
                                <span>Total Revenue: {formatCurrency(parsedRevenue)}</span>
                                <span className="text-[#E50914] font-bold">{progress}%</span>
                            </div>
                        </div>

                        {/* Live Revenue Summary Card during loading */}
                        <div className="grid grid-cols-3 gap-2 border border-neutral-800 bg-neutral-900/60 p-3 rounded-xl text-left text-xs font-mono">
                            <div>
                                <span className="text-[10px] text-neutral-400 block">Duration</span>
                                <span className="font-bold text-white">{daysCount} Days</span>
                            </div>
                            <div>
                                <span className="text-[10px] text-neutral-400 block">Sessions</span>
                                <span className="font-bold text-white">{completedSessions}</span>
                            </div>
                            <div>
                                <span className="text-[10px] text-neutral-400 block">Strips</span>
                                <span className="font-bold text-[#E50914]">{completedPhotostrips}</span>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
