import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { initializeTheme } from '@/hooks/use-appearance';
import { NavProvider, useNavigation } from '@/lib/navigation';
import * as api from '@/lib/api';

// Pages
import Dashboard from '@/pages/dashboard';
import QueuingIndex from '@/pages/queuing/index';
import Display from '@/pages/queuing/display';
import EventsIndex from '@/pages/events/index';
import CalendarIndex from '@/pages/calendar/index';
import FinancialsIndex from '@/pages/financials/index';
import TemplatesIndex from '@/pages/templates/index';
import ProfileSettings from '@/pages/settings/profile';
import SecuritySettings from '@/pages/settings/security';
import AppearanceSettings from '@/pages/settings/appearance';

import '../css/app.css';

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean; error: any }> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }

  componentDidCatch(error: any, errorInfo: any) {
    console.error('Shutterbox System Error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-6 bg-neutral-950 text-red-500 font-mono min-h-screen">
          <h2 className="text-xl font-bold mb-2">Shutterbox Application Error</h2>
          <pre className="text-xs bg-neutral-900 p-4 rounded border border-neutral-800 text-neutral-300 overflow-auto">
            {String(this.state.error?.stack || this.state.error)}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}

function MainAppShell() {
  const { currentPath, navigate, reloadKey } = useNavigation();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true);

  // Listen to navigation and reload events
  useEffect(() => {
    const handleNavigate = (e: any) => {
      if (e.detail) navigate(e.detail);
    };
    window.addEventListener('app-navigate', handleNavigate);
    return () => window.removeEventListener('app-navigate', handleNavigate);
  }, [navigate]);

  useEffect(() => {
    let isMounted = true;
    setLoading(true);

    async function fetchData() {
      try {
        if (currentPath === '/dashboard' || currentPath === '/') {
          const dashData = await api.getDashboardData();
          if (isMounted) setData(dashData);
        } else if (currentPath === '/queuing') {
          const [sessions, templates, boothLocations, todayStats] = await Promise.all([
            api.getQueueSessions(),
            api.getTemplates(),
            api.getBoothLocations(),
            api.getTodayQueueStats(),
          ]);
          if (isMounted) setData({ sessions, templates, boothLocations, todayStats });
        } else if (currentPath === '/queuing/display') {
          const [sessions, todayStats] = await Promise.all([
            api.getQueueSessions(),
            api.getTodayQueueStats(),
          ]);
          if (isMounted) setData({ sessions, todayStats });
        } else if (currentPath === '/events') {
          const boothLocations = await api.getBoothLocations();
          const stats = {
            total_events: boothLocations.length,
            active_events: boothLocations.filter((b: any) => b.status === 'active').length,
            upcoming_events: boothLocations.filter((b: any) => b.status === 'upcoming').length,
            completed_events: boothLocations.filter((b: any) => b.status === 'completed').length,
            inactive_events: boothLocations.filter((b: any) => b.status === 'inactive').length,
          };
          if (isMounted) setData({ events: boothLocations, stats });
        } else if (currentPath === '/calendar') {
          const [bookings, boothLocations, templates] = await Promise.all([
            api.getBookings(),
            api.getBoothLocations(),
            api.getTemplates(),
          ]);
          if (isMounted) setData({ bookings, boothLocations, templates });
        } else if (currentPath === '/financials') {
          const [expenses, boothLocations, dashData] = await Promise.all([
            api.getExpenses(),
            api.getBoothLocations(),
            api.getDashboardData(),
          ]);
          const grossSales = dashData?.metrics?.today_gross_sales || 0;
          const totalExpenses = expenses.reduce((sum: number, e: any) => sum + (e.amount || 0), 0);
          const stats = {
            today_gross_sales: grossSales,
            total_expenses: totalExpenses,
            net_profit: grossSales - totalExpenses,
            expenses_count: expenses.length,
          };
          if (isMounted) setData({ expenses, boothLocations, stats });
        } else if (currentPath === '/templates') {
          const templates = await api.getTemplates();
          if (isMounted) setData({ templates });
        } else if (currentPath.startsWith('/settings')) {
          const user = await api.getCurrentUser();
          if (isMounted) setData({ user });
        }
      } catch (err) {
        console.error('Error fetching data for path:', currentPath, err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    fetchData();

    return () => {
      isMounted = false;
    };
  }, [currentPath, reloadKey]);

  useEffect(() => {
    const handleReload = () => {
      // Refresh current view data
      navigate(currentPath);
    };
    window.addEventListener('app-reload', handleReload);
    return () => window.removeEventListener('app-reload', handleReload);
  }, [currentPath, navigate]);

  const renderView = () => {
    if (loading) {
      return (
        <div className="flex h-screen items-center justify-center bg-neutral-950 text-white font-mono">
          <div className="flex flex-col items-center gap-3">
            <div className="size-8 rounded-full border-2 border-[#E50914] border-t-transparent animate-spin" />
            <span className="text-xs text-neutral-400">Loading Shutterbox System...</span>
          </div>
        </div>
      );
    }

    switch (currentPath) {
      case '/dashboard':
      case '/': {
        const page = (
          <Dashboard
            metrics={data?.metrics || { today_gross_sales: 0, today_sessions: 0, today_photostrips: 0, waiting_queue: 0, in_booth_queue: 0 }}
            activeBooth={data?.activeBooth || null}
            topTemplate={data?.topTemplate || null}
            recentSessions={data?.recentSessions || []}
            upcomingBookings={data?.upcomingBookings || []}
          />
        );
        return Dashboard.layout ? Dashboard.layout(page) : page;
      }
      case '/queuing': {
        const page = (
          <QueuingIndex
            sessions={data?.sessions || []}
            templates={data?.templates || []}
            boothLocations={data?.boothLocations || []}
            todayStats={data?.todayStats || { total_queue: 0, completed_today: 0, waiting_now: 0, in_booth_now: 0 }}
          />
        );
        return QueuingIndex.layout ? QueuingIndex.layout(page) : page;
      }
      case '/queuing/display': {
        return (
          <Display
            sessions={data?.sessions || []}
            todayStats={data?.todayStats || { total_queue: 0, completed_today: 0, waiting_now: 0, in_booth_now: 0 }}
          />
        );
      }
      case '/events': {
        const page = (
          <EventsIndex
            events={data?.events || []}
            stats={data?.stats || { total_events: 0, active_events: 0, upcoming_events: 0, completed_events: 0, inactive_events: 0 }}
          />
        );
        return EventsIndex.layout ? EventsIndex.layout(page) : page;
      }
      case '/calendar': {
        const page = (
          <CalendarIndex
            bookings={data?.bookings || []}
            boothLocations={data?.boothLocations || []}
            templates={data?.templates || []}
          />
        );
        return CalendarIndex.layout ? CalendarIndex.layout(page) : page;
      }
      case '/financials': {
        const page = (
          <FinancialsIndex
            expenses={data?.expenses || []}
            boothLocations={data?.boothLocations || []}
            stats={data?.stats || { today_gross_sales: 0, total_expenses: 0, net_profit: 0, expenses_count: 0 }}
          />
        );
        return FinancialsIndex.layout ? FinancialsIndex.layout(page) : page;
      }
      case '/templates': {
        const page = (
          <TemplatesIndex templates={data?.templates || []} />
        );
        return TemplatesIndex.layout ? TemplatesIndex.layout(page) : page;
      }
      case '/settings':
      case '/settings/profile': {
        const page = <ProfileSettings mustVerifyEmail={false} status={null} />;
        return ProfileSettings.layout ? ProfileSettings.layout(page) : page;
      }
      case '/settings/security': {
        const page = <SecuritySettings />;
        return SecuritySettings.layout ? SecuritySettings.layout(page) : page;
      }
      case '/settings/appearance': {
        const page = <AppearanceSettings />;
        return AppearanceSettings.layout ? AppearanceSettings.layout(page) : page;
      }
      default: {
        const page = (
          <Dashboard
            metrics={data?.metrics || { today_gross_sales: 0, today_sessions: 0, today_photostrips: 0, waiting_queue: 0, in_booth_queue: 0 }}
            activeBooth={data?.activeBooth || null}
            topTemplate={data?.topTemplate || null}
            recentSessions={data?.recentSessions || []}
            upcomingBookings={data?.upcomingBookings || []}
          />
        );
        return Dashboard.layout ? Dashboard.layout(page) : page;
      }
    }
  };

  return <>{renderView()}</>;
}

export function App() {
  return (
    <ErrorBoundary>
      <TooltipProvider delayDuration={0}>
        <NavProvider>
          <MainAppShell />
          <Toaster />
        </NavProvider>
      </TooltipProvider>
    </ErrorBoundary>
  );
}

initializeTheme();

const rootElement = document.getElementById('app');
if (rootElement) {
  createRoot(rootElement).render(<App />);
}
