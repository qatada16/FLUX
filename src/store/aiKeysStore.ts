import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Fallback order: the first provider with a key is tried first, then the next.
export const AI_PROVIDERS = ['cerebras', 'mistral', 'gemini', 'groq'] as const;
export type AiProvider = (typeof AI_PROVIDERS)[number];

export const AI_PROVIDER_LABELS: Record<AiProvider, string> = {
  cerebras: 'Cerebras',
  mistral: 'Mistral',
  gemini: 'Gemini',
  groq: 'Groq',
};

export type AiKeys = Partial<Record<AiProvider, string>>;
export type AiUsage = Partial<Record<AiProvider, number>>;

interface AiKeysState {
  // Which user these cached keys belong to. Guards against one account ever
  // using another account's keys if a different user signs in on this device.
  userId: string | null;
  keys: AiKeys;
  usage: AiUsage;
  dirty: boolean;

  setKey: (provider: AiProvider, key: string) => void;
  incrementUsage: (provider: AiProvider) => void;
  resetUsage: (provider: AiProvider) => void;
  // Load keys pulled from the cloud for a user.
  hydrate: (userId: string, keys: AiKeys, usage: AiUsage) => void;
  markSynced: () => void;
  // Wipe cached keys (sign-out, or a different user signs in).
  clear: () => void;
}

export const useAiKeysStore = create<AiKeysState>()(
  persist(
    (set) => ({
      userId: null,
      keys: {},
      usage: {},
      dirty: false,

      setKey: (provider, key) =>
        set((state) => {
          const next = { ...state.keys };
          const trimmed = key.trim();
          if (trimmed) next[provider] = trimmed;
          else delete next[provider];
          return { keys: next, dirty: true };
        }),

      incrementUsage: (provider) =>
        set((state) => ({
          usage: { ...state.usage, [provider]: (state.usage[provider] ?? 0) + 1 },
          dirty: true,
        })),

      resetUsage: (provider) =>
        set((state) => ({
          usage: { ...state.usage, [provider]: 0 },
          dirty: true,
        })),

      hydrate: (userId, keys, usage) => set({ userId, keys, usage, dirty: false }),

      markSynced: () => set({ dirty: false }),

      clear: () => set({ userId: null, keys: {}, usage: {}, dirty: false }),
    }),
    {
      name: 'flux-ai-keys-storage',
      storage: createJSONStorage(() => AsyncStorage),
      version: 1,
    }
  )
);

/**
 * Keys usable right now: only for the signed-in user, and only if the cache
 * belongs to them. Returns {} when signed out or on a user mismatch, which
 * makes the AI path a no-op (no keys = no AI calls).
 */
export function getUsableKeys(currentUserId: string | null | undefined): AiKeys {
  const { userId, keys } = useAiKeysStore.getState();
  if (!currentUserId || userId !== currentUserId) return {};
  return keys;
}
