import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export interface Organization {
  id: string;
  name: string;
  slug: string;
  logo?: string;
  plan?: 'free' | 'pro' | 'enterprise';
  createdAt?: string;
  created_at?: string;
  member_role?: string;
}

export interface User {
  id: string;
  email: string;
  name: string;
  avatar?: string;
  role: 'user' | 'admin' | 'superadmin';
  createdAt?: string;
  created_at?: string;
  updatedAt?: string;
  updated_at?: string;
}

interface LoginCredentials {
  email: string;
  password: string;
  mfa_code?: string;
}

interface RegisterData {
  email: string;
  password: string;
  name: string;
}

interface ApiEnvelope<T> {
  success: boolean;
  data?: T;
  error?: { message?: string; code?: string };
}

interface SessionData {
  user: User;
  organization?: Organization;
  organizations?: Organization[];
  target_path?: string;
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  organizations: Organization[];
  currentOrganization: Organization | null;
  login: (credentials: LoginCredentials) => Promise<boolean>;
  register: (data: RegisterData) => Promise<void>;
  logout: () => Promise<void>;
  refreshToken: () => Promise<void>;
  checkAuth: () => Promise<void>;
  acceptTrustedSession: (session: SessionData) => void;
  setUser: (user: User) => void;
  setCurrentOrganization: (org: Organization) => void;
  clearError: () => void;
}

function normalizeApiBaseUrl(value: string | undefined): string {
  const trimmed = String(value || '').trim().replace(/\/+$/, '');
  if (!trimmed || trimmed === '/api') return '/api/v1';
  return trimmed;
}

const API_URL = normalizeApiBaseUrl(process.env.NEXT_PUBLIC_API_URL);

async function parseEnvelope<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => ({})) as ApiEnvelope<T>;
  if (!response.ok || !payload.success || payload.data === undefined) {
    throw new Error(payload.error?.message || response.statusText || 'Request failed');
  }
  return payload.data;
}

async function fetchOrganizations(): Promise<Organization[]> {
  const response = await fetch(`${API_URL}/organizations`, { credentials: 'include' });
  return parseEnvelope<Organization[]>(response);
}

async function fetchCurrentUser(): Promise<User> {
  const response = await fetch(`${API_URL}/auth/me`, { credentials: 'include' });
  return parseEnvelope<User>(response);
}

function selectCurrentOrganization(organizations: Organization[]): Organization | null {
  const selectedId = typeof window !== 'undefined' ? localStorage.getItem('org_id') : null;
  return organizations.find((org) => org.id === selectedId) || organizations[0] || null;
}

function persistSession(set: (state: Partial<AuthState>) => void, session: SessionData): void {
  const organizations = session.organizations || (session.organization ? [session.organization] : []);
  const currentOrganization = session.organization || selectCurrentOrganization(organizations);
  if (typeof window !== 'undefined') {
    // Remove credentials left by pre-cookie releases. Authentication truth now
    // comes exclusively from the server-validated HttpOnly cookie session.
    localStorage.removeItem('auth_token');
    localStorage.removeItem('refresh_token');
    if (currentOrganization) localStorage.setItem('org_id', currentOrganization.id);
    else localStorage.removeItem('org_id');
  }
  set({
    user: session.user,
    isAuthenticated: true,
    isLoading: false,
    error: null,
    organizations,
    currentOrganization,
  });
}

function clearLocalSession(set: (state: Partial<AuthState>) => void): void {
  if (typeof window !== 'undefined') {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('org_id');
  }
  set({
    user: null,
    isAuthenticated: false,
    isLoading: false,
    error: null,
    organizations: [],
    currentOrganization: null,
  });
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,
      organizations: [],
      currentOrganization: null,

      login: async (credentials: LoginCredentials) => {
        set({ isLoading: true, error: null });
        try {
          const response = await fetch(`${API_URL}/auth/login`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(credentials),
          });
          const data = await parseEnvelope<{ user: User; mfa_enrollment_required?: boolean }>(response);
          if (data.mfa_enrollment_required) {
            if (typeof window !== 'undefined') {
              localStorage.removeItem('auth_token');
              localStorage.removeItem('refresh_token');
            }
            set({ user: data.user, isAuthenticated: false, isLoading: false, error: null });
            return true;
          }
          const organizations = await fetchOrganizations();
          persistSession(set, { user: data.user, organizations });
          return false;
        } catch (error) {
          set({ error: error instanceof Error ? error.message : 'Login failed', isLoading: false });
          throw error;
        }
      },

      register: async (data: RegisterData) => {
        set({ isLoading: true, error: null });
        try {
          const response = await fetch(`${API_URL}/auth/register`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
          });
          await parseEnvelope<Record<string, unknown>>(response);
          set({ isLoading: false });
        } catch (error) {
          set({ error: error instanceof Error ? error.message : 'Registration failed', isLoading: false });
          throw error;
        }
      },

      logout: async () => {
        try {
          await fetch(`${API_URL}/auth/logout`, { method: 'POST', credentials: 'include' });
        } catch {
          // Local logout must still complete when the API is unavailable.
        }
        clearLocalSession(set);
      },

      refreshToken: async () => {
        try {
          const response = await fetch(`${API_URL}/auth/refresh`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({}),
          });
          await parseEnvelope<{ refreshed: boolean }>(response);
          const [user, organizations] = await Promise.all([fetchCurrentUser(), fetchOrganizations()]);
          persistSession(set, { user, organizations });
        } catch {
          clearLocalSession(set);
        }
      },

      checkAuth: async () => {
        set({ isLoading: true });
        try {
          const [user, organizations] = await Promise.all([fetchCurrentUser(), fetchOrganizations()]);
          persistSession(set, { user, organizations });
          return;
        } catch {
          // A valid refresh cookie may outlive the 15-minute access cookie.
        }

        try {
          const refreshResponse = await fetch(`${API_URL}/auth/refresh`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({}),
          });
          await parseEnvelope<{ refreshed: boolean }>(refreshResponse);
          const [user, organizations] = await Promise.all([fetchCurrentUser(), fetchOrganizations()]);
          persistSession(set, { user, organizations });
        } catch {
          clearLocalSession(set);
        }
      },

      acceptTrustedSession: (session: SessionData) => persistSession(set, session),

      setUser: (user: User) => set({ user }),

      setCurrentOrganization: (org: Organization) => {
        localStorage.setItem('org_id', org.id);
        set({ currentOrganization: org });
      },

      clearError: () => set({ error: null }),
    }),
    {
      name: 'auth-storage',
      storage: createJSONStorage(() => localStorage),
      // UI convenience may be persisted, but credentials and authentication truth
      // are never persisted. DashboardLayout always revalidates with /auth/me.
      partialize: (state) => ({
        user: state.user,
        organizations: state.organizations,
        currentOrganization: state.currentOrganization,
      }),
    }
  )
);
