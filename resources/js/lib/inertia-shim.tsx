import React, { useState } from 'react';
import { useNavigation } from './navigation';
import * as api from './api';

export function Head({ title }: { title?: string }) {
  React.useEffect(() => {
    if (title) {
      document.title = `${title} - Shutterbox System`;
    }
  }, [title]);
  return null;
}

export function Link({
  href,
  children,
  className,
  onClick,
  target,
  rel,
  prefetch,
  ...props
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
  onClick?: (e: React.MouseEvent) => void;
  target?: string;
  rel?: string;
  prefetch?: boolean;
  [key: string]: any;
}) {
  const { navigate } = useNavigation();
  const urlStr = typeof href === 'object' && href && (href as any).url ? (href as any).url : String(href || '');

  const handleClick = (e: React.MouseEvent) => {
    if (onClick) onClick(e);
    if (!e.defaultPrevented && !target && urlStr && urlStr.startsWith('/')) {
      e.preventDefault();
      navigate(urlStr);
    }
  };

  return (
    <a href={urlStr || '#'} className={className} onClick={handleClick} target={target} rel={rel} {...props}>
      {children}
    </a>
  );
}

export function Form({
  children,
  onSubmit,
  className,
  ...props
}: {
  children?: React.ReactNode;
  onSubmit?: (e: React.FormEvent) => void;
  className?: string;
  [key: string]: any;
}) {
  return (
    <form onSubmit={onSubmit} className={className} {...props}>
      {children}
    </form>
  );
}

export function setLayoutProps() {}

export function useHttp() {
  return {
    get: async () => ({}),
    post: async () => ({}),
    put: async () => ({}),
    patch: async () => ({}),
    delete: async () => ({}),
  };
}

export function usePage<T = any>(): { props: T & { auth?: { user: any }; [key: string]: any }; url: string } {
  const { user, currentPath } = useNavigation();
  return {
    props: {
      auth: { user },
    } as any,
    url: currentPath,
  };
}

async function handleApiCall(method: string, url: string, data?: any) {
  console.log(`[API ${method}]`, url, data);
  const cleanUrl = url.split('?')[0];

  try {
    // Queuing endpoints
    if (cleanUrl === '/queuing' && method === 'POST') {
      await api.createQueueSession(data);
    } else if (cleanUrl.match(/\/queuing\/\d+\/status/) && method === 'PATCH') {
      const id = parseInt(cleanUrl.split('/')[2]);
      await api.updateQueueSessionStatus(id, data.status);
    } else if (cleanUrl.match(/\/queuing\/\d+$/) && method === 'PUT') {
      const id = parseInt(cleanUrl.split('/')[2]);
      await api.updateQueueSession(id, data);
    } else if (cleanUrl.match(/\/queuing\/\d+$/) && method === 'DELETE') {
      const id = parseInt(cleanUrl.split('/')[2]);
      await api.deleteQueueSession(id);
    }

    // Events & Booth Locations endpoints
    else if (cleanUrl === '/events' && method === 'POST') {
      await api.createBoothLocation(data);
    } else if (cleanUrl.match(/\/events\/\d+\/toggle/) && method === 'PATCH') {
      const id = parseInt(cleanUrl.split('/')[2]);
      await api.toggleBoothStatus(id);
    } else if (cleanUrl.match(/\/events\/\d+$/) && method === 'PUT') {
      const id = parseInt(cleanUrl.split('/')[2]);
      await api.updateBoothLocation(id, data);
    } else if (cleanUrl.match(/\/events\/\d+$/) && method === 'DELETE') {
      const id = parseInt(cleanUrl.split('/')[2]);
      await api.deleteBoothLocation(id);
    }

    // Calendar & Bookings endpoints
    else if (cleanUrl === '/calendar/bookings' && method === 'POST') {
      await api.createBooking(data);
    } else if (cleanUrl.match(/\/calendar\/bookings\/\d+\/status/) && method === 'PATCH') {
      const id = parseInt(cleanUrl.split('/')[3]);
      await api.updateBookingStatus(id, data.status);
    } else if (cleanUrl.match(/\/calendar\/bookings\/\d+$/) && method === 'DELETE') {
      const id = parseInt(cleanUrl.split('/')[3]);
      await api.deleteBooking(id);
    }

    // Financials & Expenses endpoints
    else if (cleanUrl === '/financials/expenses' && method === 'POST') {
      await api.createExpense(data);
    } else if (cleanUrl.match(/\/financials\/expenses\/\d+$/) && method === 'DELETE') {
      const id = parseInt(cleanUrl.split('/')[3]);
      await api.deleteExpense(id);
    }

    // Templates endpoints
    else if (cleanUrl === '/templates' && method === 'POST') {
      await api.createTemplate(data);
    } else if (cleanUrl.match(/\/templates\/\d+\/toggle/) && method === 'PATCH') {
      const id = parseInt(cleanUrl.split('/')[2]);
      await api.toggleTemplate(id);
    }

    // Settings endpoints
    else if (cleanUrl === '/settings/profile' && (method === 'PATCH' || method === 'POST')) {
      await api.updateProfile(data.name, data.email);
    } else if (cleanUrl === '/settings/password' && method === 'PUT') {
      await api.updatePassword(data.current_password, data.password);
    }
  } catch (err) {
    console.error('API Call error:', err);
  }

  // Trigger app data refresh
  window.dispatchEvent(new CustomEvent('app-reload'));
}

export const router = {
  on: (event: string, callback: (...args: any[]) => void) => {
    const handler = (e: any) => callback(e);
    window.addEventListener(`inertia-${event}`, handler);
    return () => {
      window.removeEventListener(`inertia-${event}`, handler);
    };
  },
  off: (event: string, callback: (...args: any[]) => void) => {
    window.removeEventListener(`inertia-${event}`, callback as any);
  },
  visit: (url: string) => {
    window.dispatchEvent(new CustomEvent('app-navigate', { detail: url }));
  },
  get: (url: string) => router.visit(url),
  post: async (url: string, data?: any, options?: any) => {
    await handleApiCall('POST', url, data);
    options?.onSuccess?.();
  },
  patch: async (url: string, data?: any, options?: any) => {
    await handleApiCall('PATCH', url, data);
    options?.onSuccess?.();
  },
  put: async (url: string, data?: any, options?: any) => {
    await handleApiCall('PUT', url, data);
    options?.onSuccess?.();
  },
  delete: async (url: string, options?: any) => {
    await handleApiCall('DELETE', url);
    options?.onSuccess?.();
  },
  reload: () => {
    window.dispatchEvent(new CustomEvent('app-reload'));
  },
};

export function useForm<T extends Record<string, any>>(initialValues: T) {
  const [data, setDataState] = useState<T>(initialValues);
  const [processing, setProcessing] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const setData = (keyOrFn: any, value?: any) => {
    if (typeof keyOrFn === 'function') {
      setDataState((prev) => keyOrFn(prev));
    } else if (typeof keyOrFn === 'object') {
      setDataState((prev) => ({ ...prev, ...keyOrFn }));
    } else {
      setDataState((prev) => ({ ...prev, [keyOrFn]: value }));
    }
  };

  const reset = (...fields: string[]) => {
    if (fields.length === 0) {
      setDataState(initialValues);
    } else {
      setDataState((prev) => {
        const next = { ...prev };
        fields.forEach((f) => {
          (next as any)[f] = initialValues[f];
        });
        return next;
      });
    }
  };

  return {
    data,
    setData,
    processing,
    setProcessing,
    errors,
    setErrors,
    reset,
    post: async (url: string, options?: any) => {
      setProcessing(true);
      await router.post(url, data, options);
      setProcessing(false);
    },
    put: async (url: string, options?: any) => {
      setProcessing(true);
      await router.put(url, data, options);
      setProcessing(false);
    },
    patch: async (url: string, options?: any) => {
      setProcessing(true);
      await router.patch(url, data, options);
      setProcessing(false);
    },
    delete: async (url: string, options?: any) => {
      setProcessing(true);
      await router.delete(url, options);
      setProcessing(false);
    },
  };
}

export function createInertiaApp() {}
