import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export interface Organization {
  id: string;
  name: string;
  slug: string;
  logo?: string;
  plan: 'free' | 'pro' | 'enterprise';
  createdAt: string;
}

export interface User {
  id: string;
  email: string;
  name: string;
  avatar?: string;
  role: 'user' | 'admin' | 'superadmin';
  createdAt: string;
  updatedAt: string;
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

interface AuthResponse {
  user: User;
  token: string;
  refreshToken: string;
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
  logout: () => void;
  refreshToken: () => Promise<void>;
  checkAuth: () => Promise<void>;
  setUser: (user: User) => void;
  setCurrentOrganization: (org: Organization) => void;
  clearError: () => void;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api';

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
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(credentials),
          });

          if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || 'Login failed');
          }

          const data: AuthResponse & { organizations?: Organization[] } = await response.json();
          localStorage.setItem('auth_token', data.token);
          localStorage.setItem('refresh_token', data.refreshToken);
          const orgs = data.organizations ?? [];
          set({
            user: data.user,
            token: data.token,
            isAuthenticated: true,
            isLoading: false,
            organizations: orgs,
            currentOrganization: orgs[0] ?? null,
          });
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : 'Login failed',
            isLoading: false,
          });
          throw error;
        }
      },

      register: async (data: RegisterData) => {
        set({ isLoading: true, error: null });
        try {
          const response = await fetch(`${API_URL}/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
          });

          if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || 'Registration failed');
          }

          const result: AuthResponse = await response.json();
          localStorage.setItem('auth_token', result.token);
          localStorage.setItem('refresh_token', result.refreshToken);
          set({
            user: result.user,
            token: result.token,
            isAuthenticated: true,
            isLoading: false,
          });
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : 'Registration failed',
            isLoading: false,
          });
          throw error;
        }
      },

      logout: () => {
        localStorage.removeItem('auth_token');
        localStorage.removeItem('refresh_token');
        set({
          user: null,
          token: null,
          isAuthenticated: false,
          error: null,
        });
      },

      refreshToken: async () => {
        const refreshToken = localStorage.getItem('refresh_token');
        if (!refreshToken) {
          get().logout();
          return;
        }

        try {
          const response = await fetch(`${API_URL}/auth/refresh`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refreshToken }),
          });

          if (!response.ok) {
            throw new Error('Token refresh failed');
          }

          const data: AuthResponse = await response.json();
          localStorage.setItem('auth_token', data.token);
          localStorage.setItem('refresh_token', data.refreshToken);
          set({
            user: data.user,
            token: data.token,
            isAuthenticated: true,
          });
        } catch {
          get().logout();
        }
      },

      checkAuth: async () => {
        const token = localStorage.getItem('auth_token');
        if (!token) {
          set({ isAuthenticated: false, isLoading: false });
          return;
        }

        set({ isLoading: true });
        try {
          const response = await fetch(`${API_URL}/auth/me`, {
            headers: { Authorization: `Bearer ${token}` },
          });

          if (!response.ok) {
            throw new Error('Auth check failed');
          }

          const user: User = await response.json();
          set({
            user,
            token,
            isAuthenticated: true,
            isLoading: false,
          });
        } catch {
          await get().refreshToken();
          set({ isLoading: false });
        }
      },

      setUser: (user: User) => set({ user }),

      setCurrentOrganization: (org: Organization) => set({ currentOrganization: org }),

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
