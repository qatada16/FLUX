import { create } from 'zustand';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import type { Session, User } from '@supabase/supabase-js';

// Translate raw fetch/DNS failures into something a human can act on. The
// default messages leak Java exceptions ("UnknownHostException...") that read
// like crashes when the real problem is just connectivity.
function friendlyAuthError(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const msg = raw.toLowerCase();
  if (
    msg.includes('fetch failed') ||
    msg.includes('network request failed') ||
    msg.includes('unknownhost') ||
    msg.includes('unable to resolve host') ||
    msg.includes('timeout') ||
    msg.includes('failed to fetch')
  ) {
    return 'No internet connection. Check your network and try again.';
  }
  return raw;
}

interface AuthState {
  session: Session | null;
  user: User | null;
  loading: boolean;
  initialized: boolean;

  initialize: () => Promise<void>;
  signUp: (email: string, password: string) => Promise<{ error: string | null }>;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  session: null,
  user: null,
  loading: false,
  initialized: false,

  initialize: async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      set({
        session,
        user: session?.user ?? null,
        initialized: true,
      });

      // Listen for auth changes
      supabase.auth.onAuthStateChange((_event, session) => {
        set({ session, user: session?.user ?? null });
      });
    } catch {
      set({ initialized: true });
    }
  },

  signUp: async (email, password) => {
    if (!isSupabaseConfigured) {
      return { error: 'Cloud sync is not configured in this build.' };
    }
    set({ loading: true });
    try {
      const { data, error } = await supabase.auth.signUp({ email, password });
      set({ session: data.session, user: data.user });
      return { error: friendlyAuthError(error?.message) };
    } catch (err) {
      return { error: friendlyAuthError((err as Error)?.message) ?? 'Sign up failed.' };
    } finally {
      set({ loading: false });
    }
  },

  signIn: async (email, password) => {
    if (!isSupabaseConfigured) {
      return { error: 'Cloud sync is not configured in this build.' };
    }
    set({ loading: true });
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      set({ session: data.session, user: data.user });
      return { error: friendlyAuthError(error?.message) };
    } catch (err) {
      return { error: friendlyAuthError((err as Error)?.message) ?? 'Sign in failed.' };
    } finally {
      set({ loading: false });
    }
  },

  signOut: async () => {
    try {
      await supabase.auth.signOut();
    } catch {
      // Even if the network call fails, drop the local session.
    }
    set({ session: null, user: null });
  },
}));
