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
  accessToken: string;
  organization?: Organization;
  organizations?: Organization[];
  target_path?: string;
}

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  organizations: Organization[];
  currentOrganization: Organization | null;
  login: (credentials: LoginCredentials) => Promise<void>;
  register: (data: RegisterData) => Promise<void>;
  logout: () => Promise<void>;
  refreshToken: () => Promise<void>;
  checkAuth: () => Promise<void>;
  acceptTrustedSession: (session: SessionData) => void;
  setUser: (user: User) => void;
  setCurrentOrganization: (org: Organization) => void;
  clearError: () => void;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1';

async function parseEnvelope<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => ({})) as ApiEnvelope<T>;
  if (!response.ok || !payload.success || payload.data === undefined) {
    throw new Error(payload.error?.message || response.statusText || 'Request failed');
  }
  return payload.data;
}

async function fetchOrganizations(accessToken: string): Promise<Organization[]> {
  const response = await fetch(`${API_URL}/organizations`, {
    credentials: 'include',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return parseEnvelope<Organization[]>(response);
}

function persistSession(set: (state: Partial<AuthState>) => void, session: SessionData): void {
  const organizations = session.organizations || (session.organization ? [session.organization] : []);
  const currentOrganization = session.organization || organizations[0] || null;
  localStorage.setItem('auth_token', session.accessToken);
  if (currentOrganization) localStorage.setItem('org_id', currentOrganization.id);
  else localStorage.removeItem('org_id');
  set({
    user: session.user,
    token: session.accessToken,
    isAuthenticated: true,
    isLoading: false,
    error: null,
    organizations,
    currentOrganization,
  });
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
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
          const data = await parseEnvelope<{ user: User; accessToken: string }>(response);
          const organizations = await fetchOrganizations(data.accessToken);
          persistSession(set, { ...data, organizations });
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
          const session = await parseEnvelope<{ user: User; accessToken: string }>(response);
          persistSession(set, { ...session, organizations: [] });
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
        localStorage.removeItem('auth_token');
        localStorage.removeItem('refresh_token');
        localStorage.removeItem('org_id');
        set({
          user: null,
          token: null,
          isAuthenticated: false,
          isLoading: false,
          error: null,
          organizations: [],
          currentOrganization: null,
        });
      },

      refreshToken: async () => {
        try {
          const response = await fetch(`${API_URL}/auth/refresh`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({}),
          });
          const data = await parseEnvelope<{ accessToken: string }>(response);
          localStorage.setItem('auth_token', data.accessToken);
          set({ token: data.accessToken, isAuthenticated: true });
        } catch {
          await get().logout();
        }
      },

      checkAuth: async () => {
        let token = localStorage.getItem('auth_token');
        if (!token) {
          set({ isLoading: true });
          await get().refreshToken();
          token = localStorage.getItem('auth_token');
          if (!token) {
            set({ isAuthenticated: false, isLoading: false });
            return;
          }
        }

        set({ isLoading: true });
        try {
          const response = await fetch(`${API_URL}/auth/me`, {
            credentials: 'include',
            headers: { Authorization: `Bearer ${token}` },
          });
          const user = await parseEnvelope<User>(response);
          const organizations = await fetchOrganizations(token);
          const selectedId = localStorage.getItem('org_id');
          const currentOrganization = organizations.find((org) => org.id === selectedId) || organizations[0] || null;
          if (currentOrganization) localStorage.setItem('org_id', currentOrganization.id);
          set({ user, token, isAuthenticated: true, isLoading: false, organizations, currentOrganization });
        } catch {
          await get().refreshToken();
          set({ isLoading: false });
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
      partialize: (state) => ({
        user: state.user,
        token: state.token,
        isAuthenticated: state.isAuthenticated,
        organizations: state.organizations,
        currentOrganization: state.currentOrganization,
      }),
    }
  )
);
