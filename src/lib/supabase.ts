import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

/**
 * Whether real Supabase credentials are configured. When false, the app runs
 * in fully-offline mode (the "Skip for now" path) and any cloud call fails
 * gracefully instead of crashing.
 */
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

if (!isSupabaseConfigured) {
  // Do NOT throw — createClient() throws on an empty URL, which would crash the
  // app at startup (this is what broke production builds that shipped without
  // the EXPO_PUBLIC_SUPABASE_* env vars baked in).
  console.warn(
    '[Flux] Supabase env vars missing — running offline. ' +
      'Cloud sync and sign-in are disabled.'
  );
}

// Fall back to a syntactically-valid placeholder URL so createClient never
// throws. Network calls against it simply fail and are caught by callers.
export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-anon-key',
  {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false, // not needed in React Native
    },
  }
);
