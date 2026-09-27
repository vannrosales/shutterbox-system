import { Link } from '@inertiajs/react';
import { Calendar, DollarSign, LayoutGrid, LayoutTemplate, MapPin, Ticket } from 'lucide-react';
import AppLogo from '@/components/app-logo';
import { NavFooter } from '@/components/nav-footer';
import { NavMain } from '@/components/nav-main';
import { NavUser } from '@/components/nav-user';
import {
    Sidebar,
    SidebarContent,
    SidebarFooter,
    SidebarHeader,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
} from '@/components/ui/sidebar';
import { dashboard } from '@/routes';
import type { NavGroup, NavItem } from '@/types';

const mainNavGroups: NavGroup[] = [
    {
        title: 'Overview',
        items: [
            {
                title: 'Dashboard',
                href: '/dashboard',
                icon: LayoutGrid,
            },
        ],
    },
    {
        title: 'Operations',
        items: [
            {
                title: 'Queuing POS',
                href: '/queuing',
                icon: Ticket,
            },
            {
                title: 'Events & Booths',
                href: '/events',
                icon: MapPin,
            },
            {
                title: 'Calendar & Bookings',
                href: '/calendar',
                icon: Calendar,
            },
        ],
    },
    {
        title: 'Finance & Analytics',
        items: [
            {
                title: 'Financial Tracker',
                href: '/financials',
                icon: DollarSign,
            },
            {
                title: 'Template Reports',
                href: '/templates',
                icon: LayoutTemplate,
            },
        ],
    },
];

const footerNavItems: NavItem[] = [];

export function AppSidebar() {
    return (
        <Sidebar collapsible="icon" variant="inset">
            <SidebarHeader>
                <SidebarMenu>
                    <SidebarMenuItem>
                        <SidebarMenuButton size="lg" asChild>
                            <Link href={dashboard()} prefetch>
                                <AppLogo />
                            </Link>
                        </SidebarMenuButton>
                    </SidebarMenuItem>
                </SidebarMenu>
            </SidebarHeader>

            <SidebarContent>
                <NavMain groups={mainNavGroups} />
            </SidebarContent>

            <SidebarFooter>
                <NavFooter items={footerNavItems} className="mt-auto" />
                <NavUser />
            </SidebarFooter>
        </Sidebar>
    );
}
