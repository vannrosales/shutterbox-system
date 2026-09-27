import * as React from 'react';
import { cn } from '@/lib/utils';

interface TabsContextValue {
    value: string;
    onValueChange: (value: string) => void;
}

const TabsContext = React.createContext<TabsContextValue | undefined>(undefined);

export function Tabs({
    defaultValue,
    value,
    onValueChange,
    className,
    children,
    ...props
}: {
    defaultValue?: string;
    value?: string;
    onValueChange?: (value: string) => void;
    className?: string;
    children: React.ReactNode;
} & React.HTMLAttributes<HTMLDivElement>) {
    const [selectedTab, setSelectedTab] = React.useState(value || defaultValue || '');

    const currentTab = value !== undefined ? value : selectedTab;

    const handleValueChange = (val: string) => {
        if (value === undefined) {
            setSelectedTab(val);
        }
        if (onValueChange) {
            onValueChange(val);
        }
    };

    return (
        <TabsContext.Provider value={{ value: currentTab, onValueChange: handleValueChange }}>
            <div className={cn('w-full', className)} {...props}>
                {children}
            </div>
        </TabsContext.Provider>
    );
}

export function TabsList({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
    return (
        <div
            className={cn(
                'inline-flex h-10 items-center justify-center rounded-lg bg-muted p-1 text-muted-foreground',
                className
            )}
            {...props}
        >
            {children}
        </div>
    );
}

export function TabsTrigger({
    value,
    className,
    children,
    ...props
}: {
    value: string;
    children: React.ReactNode;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
    const context = React.useContext(TabsContext);
    if (!context) {
        throw new Error('TabsTrigger must be used within a Tabs component');
    }

    const isActive = context.value === value;

    return (
        <button
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => context.onValueChange(value)}
            className={cn(
                'inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-semibold ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
                isActive
                    ? 'bg-background text-foreground shadow-sm'
                    : 'hover:bg-background/50 hover:text-foreground',
                className
            )}
            {...props}
        >
            {children}
        </button>
    );
}

export function TabsContent({
    value,
    className,
    children,
    ...props
}: {
    value: string;
    children: React.ReactNode;
} & React.HTMLAttributes<HTMLDivElement>) {
    const context = React.useContext(TabsContext);
    if (!context) {
        throw new Error('TabsContent must be used within a Tabs component');
    }

    if (context.value !== value) {
        return null;
    }

    return (
        <div
            role="tabpanel"
            className={cn(
                'mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                className
            )}
            {...props}
        >
            {children}
        </div>
    );
}
