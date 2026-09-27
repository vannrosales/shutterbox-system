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
    Award, 
    Crown, 
    Image as ImageIcon, 
    LayoutTemplate, 
    Plus, 
    Sparkles, 
    Star, 
    TrendingUp, 
    Trophy 
} from 'lucide-react';
import type { BreadcrumbItem } from '@/types';

interface TemplateReport {
    id: number;
    name: string;
    code: string;
    category: string;
    preview_url: string | null;
    is_active: boolean;
    total_usage: number;
    queue_usage: number;
    booking_usage: number;
    total_revenue: number;
    percentage: number;
}

interface Props {
    templates: TemplateReport[];
    bestTemplate: TemplateReport | null;
    totalSelections: number;
}

const breadcrumbs: BreadcrumbItem[] = [
    { title: 'Dashboard', href: '/dashboard' },
    { title: 'Template Reports', href: '/templates' },
];

export default function TemplatesIndex({ templates, bestTemplate, totalSelections }: Props) {
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);

    const templateForm = useForm({
        name: '',
        code: '',
        category: 'Vintage & Film',
        preview_url: '',
    });

    const formatCurrency = (val: number) => {
        return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(val);
    };

    const handleFormSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        templateForm.post('/templates', {
            onSuccess: () => {
                setIsAddModalOpen(false);
                templateForm.reset();
            },
        });
    };

    const handleToggleStatus = (id: number) => {
        router.patch(`/templates/${id}/toggle`);
    };

    return (
        <>
            <Head title="Template Reports = Best Template - ShutterBox" />

            <div className="flex flex-col gap-6 p-4 md:p-6">
                {/* Header Banner */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
                            <LayoutTemplate className="size-6 text-purple-500" /> Photostrip Template Reports
                        </h1>
                        <p className="text-sm text-muted-foreground mt-1">
                            Analyze popular photostrip template selection reports and manage template designs.
                        </p>
                    </div>

                    <Dialog open={isAddModalOpen} onOpenChange={setIsAddModalOpen}>
                        <DialogTrigger asChild>
                            <Button className="bg-purple-600 hover:bg-purple-700 text-white font-semibold">
                                <Plus className="mr-2 size-4" /> Add New Template
                            </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-md">
                            <DialogHeader>
                                <DialogTitle>Add Photostrip Design Template</DialogTitle>
                                <DialogDescription>
                                    Register a new photo strip layout template for customer selection.
                                </DialogDescription>
                            </DialogHeader>

                            <form onSubmit={handleFormSubmit} className="space-y-4 py-2">
                                <div className="space-y-2">
                                    <Label htmlFor="tpl_name">Template Name</Label>
                                    <Input
                                        id="tpl_name"
                                        placeholder="e.g. Vintage Film 3-Strip"
                                        value={templateForm.data.name}
                                        onChange={(e) => templateForm.setData('name', e.target.value)}
                                        required
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="tpl_code">Template Code</Label>
                                        <Input
                                            id="tpl_code"
                                            placeholder="e.g. TPL-VINTAGE-01"
                                            value={templateForm.data.code}
                                            onChange={(e) => templateForm.setData('code', e.target.value)}
                                            required
                                        />
                                    </div>

                                    <div className="space-y-2">
                                        <Label htmlFor="tpl_category">Category</Label>
                                        <Select
                                            value={templateForm.data.category}
                                            onValueChange={(val) => templateForm.setData('category', val)}
                                        >
                                            <SelectTrigger id="tpl_category">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="Vintage & Film">Vintage & Film</SelectItem>
                                                <SelectItem value="Cute & Pastel">Cute & Pastel</SelectItem>
                                                <SelectItem value="Modern Minimal">Modern Minimal</SelectItem>
                                                <SelectItem value="Party & Glow">Party & Glow</SelectItem>
                                                <SelectItem value="Formal Event">Formal Event</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>

                                <DialogFooter>
                                    <Button type="button" variant="outline" onClick={() => setIsAddModalOpen(false)}>Cancel</Button>
                                    <Button type="submit" disabled={templateForm.processing} className="bg-purple-600 hover:bg-purple-700 text-white">
                                        Save Template
                                    </Button>
                                </DialogFooter>
                            </form>
                        </DialogContent>
                    </Dialog>
                </div>

                {/* BEST TEMPLATE SPOTLIGHT CARD */}
                {bestTemplate && (
                    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-purple-900 via-neutral-900 to-neutral-950 text-white p-6 md:p-8 shadow-xl border border-purple-800">
                        <div className="absolute top-4 right-4 flex items-center gap-2 bg-amber-400 text-neutral-950 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider shadow">
                            <Trophy className="size-4" /> #1 Best Template
                        </div>

                        <div className="flex flex-col md:flex-row md:items-center gap-6">
                            <div className="size-24 rounded-2xl bg-purple-500/20 border border-purple-400/40 flex items-center justify-center shrink-0">
                                <Crown className="size-12 text-amber-400" />
                            </div>

                            <div className="space-y-2 flex-1">
                                <span className="text-xs font-mono text-purple-300 font-semibold">{bestTemplate.code}</span>
                                <h2 className="text-2xl md:text-3xl font-black text-amber-300">{bestTemplate.name}</h2>
                                <p className="text-sm text-neutral-300">
                                    Category: <span className="font-semibold text-white">{bestTemplate.category}</span>
                                </p>
                                <div className="flex flex-wrap gap-4 pt-2">
                                    <div className="bg-white/10 px-3 py-1.5 rounded-lg">
                                        <span className="text-xs text-neutral-400 block">Total Customer Selections</span>
                                        <span className="text-lg font-bold">{bestTemplate.total_usage} times</span>
                                    </div>
                                    <div className="bg-white/10 px-3 py-1.5 rounded-lg">
                                        <span className="text-xs text-neutral-400 block">Selection Share</span>
                                        <span className="text-lg font-bold text-amber-400">{bestTemplate.percentage}%</span>
                                    </div>
                                    <div className="bg-white/10 px-3 py-1.5 rounded-lg">
                                        <span className="text-xs text-neutral-400 block">Estimated Revenue</span>
                                        <span className="text-lg font-bold text-emerald-400">{formatCurrency(bestTemplate.total_revenue)}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* TEMPLATE RANKINGS & CATALOG */}
                <Card>
                    <CardHeader>
                        <CardTitle className="text-lg font-bold">Template Popularity & Usage Analytics</CardTitle>
                        <CardDescription>Breakdown of photostrip designs ranked by customer preference</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-4">
                            {templates.map((tpl, index) => (
                                <div key={tpl.id} className="p-4 rounded-xl border bg-card hover:bg-accent/40 transition-colors space-y-3">
                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                        <div className="flex items-center gap-3">
                                            <span className={`size-7 rounded-full flex items-center justify-center font-bold text-xs ${
                                                index === 0 ? 'bg-amber-400 text-neutral-900' :
                                                index === 1 ? 'bg-neutral-300 text-neutral-900' :
                                                index === 2 ? 'bg-amber-700 text-white' :
                                                'bg-muted text-muted-foreground'
                                            }`}>
                                                #{index + 1}
                                            </span>
                                            <div>
                                                <h4 className="font-bold text-base flex items-center gap-2">
                                                    {tpl.name}
                                                    <Badge variant="outline" className="text-[10px] font-mono">{tpl.code}</Badge>
                                                </h4>
                                                <p className="text-xs text-muted-foreground">Category: {tpl.category}</p>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-3">
                                            <div className="text-right">
                                                <span className="text-sm font-bold block">{tpl.total_usage} selections</span>
                                                <span className="text-xs text-muted-foreground">{formatCurrency(tpl.total_revenue)} sales</span>
                                            </div>

                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => handleToggleStatus(tpl.id)}
                                                className={`text-xs ${tpl.is_active ? 'border-emerald-500/50 text-emerald-600' : 'text-muted-foreground'}`}
                                            >
                                                {tpl.is_active ? 'Active' : 'Disabled'}
                                            </Button>
                                        </div>
                                    </div>

                                    {/* Progress Bar Share */}
                                    <div className="space-y-1">
                                        <div className="flex justify-between text-xs text-muted-foreground">
                                            <span>Popularity Share</span>
                                            <span className="font-semibold text-foreground">{tpl.percentage}%</span>
                                        </div>
                                        <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                                            <div
                                                className="h-full bg-purple-600 rounded-full transition-all"
                                                style={{ width: `${Math.max(tpl.percentage, 2)}%` }}
                                            />
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            </div>
        </>
    );
}

TemplatesIndex.layout = (page: React.ReactNode) => <AppLayout breadcrumbs={breadcrumbs}>{page}</AppLayout>;
