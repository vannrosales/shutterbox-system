// Wails API Client for Shutterbox System

declare global {
  interface Window {
    go?: {
      main?: {
        App?: Record<string, (...args: any[]) => Promise<any>>;
      };
    };
  }
}

function getApp() {
  if (typeof window !== 'undefined' && window.go?.main?.App) {
    return window.go.main.App;
  }
  return null;
}

// --- AUTHENTICATION ---
export async function login(email: string, pass: string) {
  const app = getApp();
  if (app?.Login) return await app.Login(email, pass);
  return { id: 1, name: 'Shutterbox Admin', email, role: 'admin' };
}

export async function getCurrentUser() {
  const app = getApp();
  if (app?.GetCurrentUser) return await app.GetCurrentUser();
  return { id: 1, name: 'Shutterbox Admin', email: 'admin@shutterbox.com', role: 'admin' };
}

export async function logout() {
  const app = getApp();
  if (app?.Logout) return await app.Logout();
  return true;
}

export async function updateProfile(name: string, email: string) {
  const app = getApp();
  if (app?.UpdateProfile) return await app.UpdateProfile(name, email);
  return { id: 1, name, email, role: 'admin' };
}

export async function updatePassword(curr: string, next: string) {
  const app = getApp();
  if (app?.UpdatePassword) return await app.UpdatePassword(curr, next);
  return true;
}

// --- DASHBOARD ---
export async function getDashboardData() {
  const app = getApp();
  if (app?.GetDashboardData) return await app.GetDashboardData();

  return {
    metrics: {
      today_gross_sales: 4500.0,
      today_sessions: 18,
      today_photostrips: 42,
      waiting_queue: 3,
      in_booth_queue: 1,
    },
    activeBooth: {
      id: 1,
      name: 'SM Megamall Main Atrium Station',
      address: 'EDSA corner Doña Julia Vargas Ave',
      city: 'Mandaluyong City',
      status: 'active',
    },
    topTemplate: {
      id: 1,
      name: 'Classic 4-Frame Vertical Strip',
      queue_sessions_count: 14,
    },
    recentSessions: [],
    upcomingBookings: [],
  };
}

// --- QUEUING POS ---
export async function getQueueSessions() {
  const app = getApp();
  if (app?.GetQueueSessions) return await app.GetQueueSessions();
  return [];
}

export async function getTodayQueueStats() {
  const app = getApp();
  if (app?.GetTodayQueueStats) return await app.GetTodayQueueStats();
  return { total_queue: 0, completed_today: 0, waiting_now: 0, in_booth_now: 0 };
}

export async function createQueueSession(input: {
  customer_name: string;
  booth_location_id?: number | null;
  sessions_count: number;
  extra_copies: number;
  base_price_per_session: number;
  payment_method: string;
  payment_status: string;
  notes?: string;
  template_ids: number[];
}) {
  const app = getApp();
  if (app?.CreateQueueSession) return await app.CreateQueueSession(input);
  throw new Error('Wails Go backend not connected');
}

export async function updateQueueSessionStatus(id: number, status: string) {
  const app = getApp();
  if (app?.UpdateQueueSessionStatus) return await app.UpdateQueueSessionStatus(id, status);
  return null;
}

export async function updateQueueSession(id: number, input: any) {
  const app = getApp();
  if (app?.UpdateQueueSession) return await app.UpdateQueueSession(id, input);
  return null;
}

export async function deleteQueueSession(id: number) {
  const app = getApp();
  if (app?.DeleteQueueSession) return await app.DeleteQueueSession(id);
  return true;
}

// --- BOOTH LOCATIONS & EVENTS ---
export async function getBoothLocations() {
  const app = getApp();
  if (app?.GetBoothLocations) return await app.GetBoothLocations();
  return [];
}

export async function createBoothLocation(input: any) {
  const app = getApp();
  if (app?.CreateBoothLocation) return await app.CreateBoothLocation(input);
  return null;
}

export async function updateBoothLocation(id: number, input: any) {
  const app = getApp();
  if (app?.UpdateBoothLocation) return await app.UpdateBoothLocation(id, input);
  return null;
}

export async function toggleBoothStatus(id: number) {
  const app = getApp();
  if (app?.ToggleBoothStatus) return await app.ToggleBoothStatus(id);
  return null;
}

export async function deleteBoothLocation(id: number) {
  const app = getApp();
  if (app?.DeleteBoothLocation) return await app.DeleteBoothLocation(id);
  return true;
}

// --- BOOKINGS & CALENDAR ---
export async function getBookings() {
  const app = getApp();
  if (app?.GetBookings) return await app.GetBookings();
  return [];
}

export async function createBooking(input: any) {
  const app = getApp();
  if (app?.CreateBooking) return await app.CreateBooking(input);
  return null;
}

export async function updateBookingStatus(id: number, status: string) {
  const app = getApp();
  if (app?.UpdateBookingStatus) return await app.UpdateBookingStatus(id, status);
  return null;
}

export async function deleteBooking(id: number) {
  const app = getApp();
  if (app?.DeleteBooking) return await app.DeleteBooking(id);
  return true;
}

// --- FINANCIAL TRACKER & EXPENSES ---
export async function getExpenses() {
  const app = getApp();
  if (app?.GetExpenses) return await app.GetExpenses();
  return [];
}

export async function createExpense(input: any) {
  const app = getApp();
  if (app?.CreateExpense) return await app.CreateExpense(input);
  return null;
}

export async function deleteExpense(id: number) {
  const app = getApp();
  if (app?.DeleteExpense) return await app.DeleteExpense(id);
  return true;
}

// --- TEMPLATES ---
export async function getTemplates() {
  const app = getApp();
  if (app?.GetTemplates) return await app.GetTemplates();
  return [];
}

export async function createTemplate(input: any) {
  const app = getApp();
  if (app?.CreateTemplate) return await app.CreateTemplate(input);
  return null;
}

export async function toggleTemplate(id: number) {
  const app = getApp();
  if (app?.ToggleTemplate) return await app.ToggleTemplate(id);
  return null;
}
