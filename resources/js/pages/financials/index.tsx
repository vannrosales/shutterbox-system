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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
    CreditCard, 
    DollarSign, 
    Download, 
    FileText, 
    Filter, 
    Plus, 
    Printer, 
    Receipt, 
    TrendingDown, 
    TrendingUp, 
    Wallet 
} from 'lucide-react';
import type { BreadcrumbItem } from '@/types';

interface BoothLocation {
    id: number;
    name: string;
}

interface Expense {
    id: number;
    booth_location_id: number | null;
    category: string;
    description: string;
    amount: number;
    expense_date: string;
    receipt_number: string | null;
    booth_location?: BoothLocation;
}

interface QueueSession {
    id: number;
    queue_number: string;
    customer_name: string;
    total_price: number;
    payment_method: string;
    created_at: string;
}

interface Props {
    selectedDate: string;
    dailyStats: {
        gross_sales: number;
        queue_sales: number;
        booking_sales: number;
        sessions_count: number;
        photostrips_count: number;
        extra_copies_count: number;
        transactions_count: number;
        payment_methods: {
            cash: number;
            gcash: number;
            maya: number;
            card: number;
        };
    };
    monthlyStats: {
        gross_sales: number;
        expenses: number;
        net_income: number;
    };
    expenses: Expense[];
    boothLocations: BoothLocation[];
    recentQueueTransactions: QueueSession[];
}

const breadcrumbs: BreadcrumbItem[] = [
    { title: 'Dashboard', href: '/dashboard' },
    { title: 'Financial Tracker', href: '/financials' },
];

export default function FinancialsIndex({
    selectedDate,
    dailyStats,
    monthlyStats,
    expenses,
    boothLocations,
    recentQueueTransactions,
}: Props) {
    const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
    const [dateInput, setDateInput] = useState(selectedDate);

    const expenseForm = useForm({
        booth_location_id: boothLocations.length > 0 ? String(boothLocations[0].id) : '',
        category: 'Photo Paper Roll',
        description: '',
        amount: '',
        expense_date: new Date().toISOString().split('T')[0],
        receipt_number: '',
    });

    const formatCurrency = (val: number) => {
        return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(val);
    };

    const handleDateFilterChange = (newDate: string) => {
        setDateInput(newDate);
        router.get('/financials', { date: newDate }, { preserveState: true });
    };

    const handleExpenseSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        expenseForm.post('/financials/expenses', {
            onSuccess: () => {
                setIsExpenseModalOpen(false);
                expenseForm.reset();
            },
        });
    };

    const handleDeleteExpense = (id: number) => {
        if (confirm('Delete this expense record?')) {
            router.delete(`/financials/expenses/${id}`);
        }
    };

    return (
        <>
            <Head title="Financial Tracker & Gross Sales - ShutterBox" />

            <div className="flex flex-col gap-6 p-4 md:p-6">
                {/* Header Banner */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
                            <DollarSign className="size-6 text-emerald-500" /> Daily Gross Sales & Financial Tracker
                        </h1>
                        <p className="text-sm text-muted-foreground mt-1">
                            Monitor daily sales, payment breakdown, expenses, and net profit revenue.
                        </p>
                    </div>

                    <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2 bg-card border rounded-lg p-1.5 shadow-sm">
                            <Label htmlFor="filter-date" className="text-xs font-semibold px-1">Date:</Label>
                            <Input
                                id="filter-date"
                                type="date"
                                value={dateInput}
                                onChange={(e) => handleDateFilterChange(e.target.value)}
                                className="h-8 text-xs font-mono w-36"
                            />
                        </div>

                        <Dialog open={isExpenseModalOpen} onOpenChange={setIsExpenseModalOpen}>
                            <DialogTrigger asChild>
                                <Button className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold">
                                    <Plus className="mr-2 size-4" /> Record Expense
                                </Button>
                            </DialogTrigger>
                            <DialogContent className="max-w-md">
                                <DialogHeader>
                                    <DialogTitle>Record Operational Expense</DialogTitle>
                                    <DialogDescription>
                                        Add booth expenses (paper rolls, ink, rent, staff allowance).
                                    </DialogDescription>
                                </DialogHeader>

                                <form onSubmit={handleExpenseSubmit} className="space-y-4 py-2">
                                    <div className="space-y-2">
                                        <Label htmlFor="exp_category">Expense Category</Label>
                                        <Select
                                            value={expenseForm.data.category}
                                            onValueChange={(val) => expenseForm.setData('category', val)}
                                        >
                                            <SelectTrigger id="exp_category">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="Photo Paper Roll">Photo Paper Roll</SelectItem>
                                                <SelectItem value="Ink Cartridges">Ink Cartridges</SelectItem>
                                                <SelectItem value="Booth Rental Fee">Booth Rental Fee</SelectItem>
                                                <SelectItem value="Staff Allowance">Staff Allowance</SelectItem>
                                                <SelectItem value="Transport">Transport / Delivery</SelectItem>
                                                <SelectItem value="Utilities">Utilities & Power</SelectItem>
                                                <SelectItem value="Maintenance">Maintenance & Repairs</SelectItem>
                                                <SelectItem value="Other">Other Operational Cost</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    <div className="space-y-2">
                                        <Label htmlFor="exp_desc">Description</Label>
                                        <Input
                                            id="exp_desc"
                                            placeholder="e.g. DNP RX1 4x6 Paper Roll (2 Rolls)"
                                            value={expenseForm.data.description}
                                            onChange={(e) => expenseForm.setData('description', e.target.value)}
                                            required
                                        />
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <Label htmlFor="exp_amount">Amount (₱)</Label>
                                            <Input
                                                id="exp_amount"
                                                type="number"
                                                step="0.01"
                                                placeholder="0.00"
                                                value={expenseForm.data.amount}
                                                onChange={(e) => expenseForm.setData('amount', e.target.value)}
                                                required
                                            />
                                        </div>

                                        <div className="space-y-2">
                                            <Label htmlFor="exp_date">Date</Label>
                                            <Input
                                                id="exp_date"
                                                type="date"
                                                value={expenseForm.data.expense_date}
                                                onChange={(e) => expenseForm.setData('expense_date', e.target.value)}
                                                required
                                            />
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <Label htmlFor="receipt_no">Receipt / Voucher # (Optional)</Label>
                                        <Input
                                            id="receipt_no"
                                            placeholder="e.g. OR-99812"
                                            value={expenseForm.data.receipt_number}
                                            onChange={(e) => expenseForm.setData('receipt_number', e.target.value)}
                                        />
                                    </div>

                                    <DialogFooter>
                                        <Button type="button" variant="outline" onClick={() => setIsExpenseModalOpen(false)}>Cancel</Button>
                                        <Button type="submit" disabled={expenseForm.processing} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                                            Save Expense
                                        </Button>
                                    </DialogFooter>
                                </form>
                            </DialogContent>
                        </Dialog>
                    </div>
                </div>

                {/* Daily Gross Sales KPI Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <Card className="border-l-4 border-l-emerald-500 shadow-sm">
                        <CardHeader className="pb-1">
                            <CardTitle className="text-xs text-muted-foreground font-semibold">
                                Daily Gross Sales ({selectedDate})
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="text-3xl font-extrabold text-emerald-600 font-mono">
                                {formatCurrency(dailyStats.gross_sales)}
                            </div>
                            <div className="text-xs text-muted-foreground mt-1 flex justify-between">
                                <span>POS: {formatCurrency(dailyStats.queue_sales)}</span>
                                <span>Bookings: {formatCurrency(dailyStats.booking_sales)}</span>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="border-l-4 border-l-amber-500 shadow-sm">
                        <CardHeader className="pb-1">
                            <CardTitle className="text-xs text-muted-foreground font-semibold">
                                Daily Sessions & Volume
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">
                                {dailyStats.sessions_count} <span className="text-sm font-normal text-muted-foreground">sessions</span>
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">
                                {dailyStats.photostrips_count} photostrips printed ({dailyStats.extra_copies_count} extra copies)
                            </p>
                        </CardContent>
                    </Card>

                    <Card className="border-l-4 border-l-blue-500 shadow-sm">
                        <CardHeader className="pb-1">
                            <CardTitle className="text-xs text-muted-foreground font-semibold">
                                Monthly Gross Sales
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{formatCurrency(monthlyStats.gross_sales)}</div>
                            <p className="text-xs text-muted-foreground mt-1">
                                Accumulated sales this calendar month
                            </p>
                        </CardContent>
                    </Card>

                    <Card className="border-l-4 border-l-purple-500 shadow-sm">
                        <CardHeader className="pb-1">
                            <CardTitle className="text-xs text-muted-foreground font-semibold">
                                Monthly Net Income
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className={`text-2xl font-bold ${monthlyStats.net_income >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                {formatCurrency(monthlyStats.net_income)}
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">
                                Revenue minus {formatCurrency(monthlyStats.expenses)} expenses
                            </p>
                        </CardContent>
                    </Card>
                </div>

                {/* Main Content Tabs: Sales Breakdown vs Expenses vs Transactions */}
                <Tabs defaultValue="sales" className="w-full">
                    <TabsList>
                        <TabsTrigger value="sales">Daily Sales & Payment Methods</TabsTrigger>
                        <TabsTrigger value="expenses">Expenses Tracker ({expenses.length})</TabsTrigger>
                    </TabsList>

                    {/* Tab 1: Sales Breakdown */}
                    <TabsContent value="sales" className="mt-4 space-y-6">
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            {/* Payment Method Split */}
                            <Card>
                                <CardHeader>
                                    <CardTitle className="text-base font-bold flex items-center gap-2">
                                        <Wallet className="size-4 text-emerald-600" /> Payment Methods Breakdown
                                    </CardTitle>
                                    <CardDescription>Daily revenue split by payment channel</CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <div className="flex justify-between items-center p-3 rounded-lg border bg-card">
                                        <div className="flex items-center gap-3">
                                            <div className="size-9 rounded-lg bg-emerald-500/10 text-emerald-600 flex items-center justify-center font-bold text-xs">
                                                CASH
                                            </div>
                                            <div>
                                                <h4 className="font-semibold text-sm">Cash Payments</h4>
                                                <p className="text-xs text-muted-foreground">Booth cash register</p>
                                            </div>
                                        </div>
                                        <span className="font-mono font-bold text-sm">{formatCurrency(dailyStats.payment_methods.cash)}</span>
                                    </div>

                                    <div className="flex justify-between items-center p-3 rounded-lg border bg-card">
                                        <div className="flex items-center gap-3">
                                            <div className="size-9 rounded-lg bg-blue-500/10 text-blue-600 flex items-center justify-center font-bold text-xs">
                                                GCASH
                                            </div>
                                            <div>
                                                <h4 className="font-semibold text-sm">GCash QR</h4>
                                                <p className="text-xs text-muted-foreground">E-wallet mobile payment</p>
                                            </div>
                                        </div>
                                        <span className="font-mono font-bold text-sm">{formatCurrency(dailyStats.payment_methods.gcash)}</span>
                                    </div>

                                    <div className="flex justify-between items-center p-3 rounded-lg border bg-card">
                                        <div className="flex items-center gap-3">
                                            <div className="size-9 rounded-lg bg-teal-500/10 text-teal-600 flex items-center justify-center font-bold text-xs">
                                                MAYA
                                            </div>
                                            <div>
                                                <h4 className="font-semibold text-sm">Maya QR</h4>
                                                <p className="text-xs text-muted-foreground">Digital Wallet</p>
                                            </div>
                                        </div>
                                        <span className="font-mono font-bold text-sm">{formatCurrency(dailyStats.payment_methods.maya)}</span>
                                    </div>

                                    <div className="flex justify-between items-center p-3 rounded-lg border bg-card">
                                        <div className="flex items-center gap-3">
                                            <div className="size-9 rounded-lg bg-purple-500/10 text-purple-600 flex items-center justify-center font-bold text-xs">
                                                CARD
                                            </div>
                                            <div>
                                                <h4 className="font-semibold text-sm">Credit / Debit Card</h4>
                                                <p className="text-xs text-muted-foreground">POS Terminal</p>
                                            </div>
                                        </div>
                                        <span className="font-mono font-bold text-sm">{formatCurrency(dailyStats.payment_methods.card)}</span>
                                    </div>
                                </CardContent>
                            </Card>

                            {/* Recent Queue Transactions on Date */}
                            <Card>
                                <CardHeader>
                                    <CardTitle className="text-base font-bold flex items-center gap-2">
                                        <Receipt className="size-4 text-amber-500" /> Daily POS Transactions Log
                                    </CardTitle>
                                    <CardDescription>Sales entries logged on {selectedDate}</CardDescription>
                                </CardHeader>
                                <CardContent>
                                    {recentQueueTransactions.length === 0 ? (
                                        <p className="text-sm text-muted-foreground py-6 text-center">No POS transactions for this date.</p>
                                    ) : (
                                        <div className="divide-y divide-border">
                                            {recentQueueTransactions.map((tx) => (
                                                <div key={tx.id} className="py-2.5 flex items-center justify-between text-xs">
                                                    <div>
                                                        <span className="font-mono font-bold text-amber-600 mr-2">{tx.queue_number}</span>
                                                        <span className="font-semibold">{tx.customer_name}</span>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <Badge variant="outline" className="uppercase text-[10px]">{tx.payment_method}</Badge>
                                                        <span className="font-bold text-emerald-600 font-mono">{formatCurrency(tx.total_price)}</span>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        </div>
                    </TabsContent>

                    {/* Tab 2: Expenses Tracker */}
                    <TabsContent value="expenses" className="mt-4">
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between">
                                <div>
                                    <CardTitle className="text-base font-bold">Recorded Operating Expenses</CardTitle>
                                    <CardDescription>Paper rolls, ink cartridges, booth rent, and staff allowances</CardDescription>
                                </div>
                            </CardHeader>
                            <CardContent>
                                {expenses.length === 0 ? (
                                    <p className="text-sm text-muted-foreground py-8 text-center">No expenses recorded yet.</p>
                                ) : (
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-xs text-left">
                                            <thead className="border-b bg-muted/40 font-semibold text-muted-foreground">
                                                <tr>
                                                    <th className="p-3">Date</th>
                                                    <th className="p-3">Category</th>
                                                    <th className="p-3">Description</th>
                                                    <th className="p-3">Receipt #</th>
                                                    <th className="p-3 text-right">Amount</th>
                                                    <th className="p-3 text-center">Actions</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-border">
                                                {expenses.map((exp) => (
                                                    <tr key={exp.id} className="hover:bg-accent/30">
                                                        <td className="p-3 font-mono">{exp.expense_date}</td>
                                                        <td className="p-3">
                                                            <Badge variant="outline">{exp.category}</Badge>
                                                        </td>
                                                        <td className="p-3 font-medium">{exp.description}</td>
                                                        <td className="p-3 font-mono text-muted-foreground">{exp.receipt_number || '-'}</td>
                                                        <td className="p-3 text-right font-bold text-red-600 font-mono">
                                                            {formatCurrency(exp.amount)}
                                                        </td>
                                                        <td className="p-3 text-center">
                                                            <Button
                                                                variant="ghost"
                                                                size="sm"
                                                                className="text-destructive h-7 text-xs"
                                                                onClick={() => handleDeleteExpense(exp.id)}
                                                            >
                                                                Delete
                                                            </Button>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </TabsContent>
                </Tabs>
            </div>
        </>
    );
}

FinancialsIndex.layout = (page: React.ReactNode) => <AppLayout breadcrumbs={breadcrumbs}>{page}</AppLayout>;
