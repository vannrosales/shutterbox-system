import React, { createContext, useContext, useEffect, useState } from 'react';
import * as api from './api';

export type RoutePath =
  | '/dashboard'
  | '/queuing'
  | '/queuing/display'
  | '/calendar'
  | '/events'
  | '/financials'
  | '/templates'
  | '/settings'
  | '/settings/profile'
  | '/settings/security'
  | '/settings/appearance'
  | '/login';

interface User {
  id: number;
  name: string;
  email: string;
  role: string;
}

interface NavContextType {
  currentPath: string;
  navigate: (path: string) => void;
  user: User | null;
  setUser: (user: User | null) => void;
  refreshUser: () => Promise<void>;
  triggerReload: () => void;
  reloadKey: number;
}

const NavContext = createContext<NavContextType>({
  currentPath: '/dashboard',
  navigate: () => {},
  user: null,
  setUser: () => {},
  refreshUser: async () => {},
  triggerReload: () => {},
  reloadKey: 0,
});

export const NavProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentPath, setCurrentPath] = useState<string>('/dashboard');
  const [user, setUser] = useState<User | null>(null);
  const [reloadKey, setReloadKey] = useState<number>(0);

  const refreshUser = async () => {
    try {
      const u = await api.getCurrentUser();
      setUser(u);
    } catch {
      setUser(null);
    }
  };

  useEffect(() => {
    refreshUser();
  }, []);

  const navigate = (path: string) => {
    setCurrentPath(path);
  };

  const triggerReload = () => {
    setReloadKey((prev) => prev + 1);
  };

  return (
    <NavContext.Provider
      value={{
        currentPath,
        navigate,
        user,
        setUser,
        refreshUser,
        triggerReload,
        reloadKey,
      }}
    >
      {children}
    </NavContext.Provider>
  );
};

export const useNavigation = () => useContext(NavContext);
