import { Card } from '@/components/ui/card';

interface TodayStats {
    total_queue: number;
    completed_today: number;
    waiting_now: number;
    in_booth_now: number;
}

interface Props {
    todayStats: TodayStats;
}

export function QueueStats({ todayStats }: Props) {
    return (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Card className="py-2.5 px-3.5 flex flex-row items-center justify-between border-neutral-800 bg-neutral-900/70 shadow-none rounded-xl">
                <span className="text-xs font-medium text-neutral-400 truncate">Today's Entries</span>
                <span className="text-base font-bold font-mono text-white ml-2">{todayStats.total_queue}</span>
            </Card>

            <Card className="py-2.5 px-3.5 flex flex-row items-center justify-between border-neutral-800 bg-neutral-900/70 shadow-none rounded-xl">
                <span className="text-xs font-medium text-neutral-400 truncate">Now Waiting</span>
                <span className="text-base font-bold font-mono text-blue-400 ml-2">{todayStats.waiting_now}</span>
            </Card>

            <Card className="py-2.5 px-3.5 flex flex-row items-center justify-between border-neutral-800 bg-neutral-900/70 shadow-none rounded-xl">
                <span className="text-xs font-medium text-neutral-400 truncate">Currently In Booth</span>
                <span className="text-base font-bold font-mono text-amber-400 ml-2">{todayStats.in_booth_now}</span>
            </Card>

            <Card className="py-2.5 px-3.5 flex flex-row items-center justify-between border-neutral-800 bg-neutral-900/70 shadow-none rounded-xl">
                <span className="text-xs font-medium text-neutral-400 truncate">Completed Today</span>
                <span className="text-base font-bold font-mono text-emerald-400 ml-2">{todayStats.completed_today}</span>
            </Card>
        </div>
    );
}
