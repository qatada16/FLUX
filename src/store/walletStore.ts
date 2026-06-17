import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Wallet } from '../types/wallet';
import { uuidv4, isUuid } from '../lib/uuid';

interface WalletState {
  wallets: Wallet[];
  hasCompletedOnboarding: boolean;

  // Actions
  addWallet: (wallet: Wallet) => void;
  updateWallet: (id: string, updates: Partial<Wallet>) => void;
  removeWallet: (id: string) => void;
  setWallets: (wallets: Wallet[]) => void;
  updateBalance: (id: string, balance: number) => void;
  completeOnboarding: () => void;
  resetOnboarding: () => void;
}

export const useWalletStore = create<WalletState>()(
  persist(
    (set) => ({
      wallets: [],
      hasCompletedOnboarding: false,

      addWallet: (wallet) =>
        set((state) => ({ wallets: [...state.wallets, wallet] })),

      updateWallet: (id, updates) =>
        set((state) => ({
          wallets: state.wallets.map((w) =>
            w.id === id ? { ...w, ...updates, updatedAt: new Date().toISOString() } : w
          ),
        })),

      removeWallet: (id) =>
        set((state) => ({
          wallets: state.wallets.filter((w) => w.id !== id),
        })),

      setWallets: (wallets) => set({ wallets }),

      updateBalance: (id, balance) =>
        set((state) => ({
          wallets: state.wallets.map((w) =>
            w.id === id
              ? { ...w, balance, updatedAt: new Date().toISOString() }
              : w
          ),
        })),

      completeOnboarding: () => set({ hasCompletedOnboarding: true }),

      resetOnboarding: () => set({ hasCompletedOnboarding: false, wallets: [] }),
    }),
    {
      name: 'flux-wallet-storage',
      storage: createJSONStorage(() => AsyncStorage),
      version: 1,
      // Migrate legacy wallets whose id was a slug like "jazzcash-<ts>-<i>"
      // instead of a UUID. Supabase's wallets.id column is `uuid`, so those
      // ids could never sync to the cloud. Replace them with real UUIDs.
      migrate: (persisted, _version) => {
        const state = persisted as Partial<WalletState> | undefined;
        if (state && Array.isArray(state.wallets)) {
          state.wallets = state.wallets.map((w) =>
            isUuid(w.id) ? w : { ...w, id: uuidv4() }
          );
        }
        return state as WalletState;
      },
    }
  )
);
