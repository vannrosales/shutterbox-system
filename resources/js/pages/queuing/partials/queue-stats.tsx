import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

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
    );
}
