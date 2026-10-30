import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Wallet } from '../types/wallet';
import { uuidv4, isUuid } from '../lib/uuid';
import { useReconcileStore } from './reconcileStore';

interface WalletState {
  wallets: Wallet[];
  hasCompletedOnboarding: boolean;
  // True when local wallets have changes not yet pushed to the cloud. All
  // mutations set it; only a successful full push clears it. Persisted, so
  // changes made offline survive an app restart and still get synced.
  dirty: boolean;
  // Wallet ids removed locally whose cloud row hasn't been deleted yet
  // (e.g. the delete happened offline). Flushed by flushPendingSync().
  pendingDeletes: string[];

  // Actions
  addWallet: (wallet: Wallet) => void;
  updateWallet: (id: string, updates: Partial<Wallet>) => void;
  removeWallet: (id: string) => void;
  setWallets: (wallets: Wallet[]) => void;
  updateBalance: (id: string, balance: number) => void;
  // A balance the user typed in: it is exact as of now, so anything that
  // arrived before this moment is already included in it.
  setBalanceManually: (id: string, balance: number) => void;
  completeOnboarding: () => void;
  resetOnboarding: () => void;
  markSynced: () => void;
  confirmDeletes: (ids: string[]) => void;
}

export const useWalletStore = create<WalletState>()(
  persist(
    (set) => ({
      wallets: [],
      hasCompletedOnboarding: false,
      dirty: false,
      pendingDeletes: [],

      addWallet: (wallet) => {
        // The opening balance the user entered already reflects every message
        // received so far — only later ones may move it.
        useReconcileStore.getState().advanceAnchor(wallet.id, Date.now());
        set((state) => ({ wallets: [...state.wallets, wallet], dirty: true }));
      },

      updateWallet: (id, updates) => {
        const before = useWalletStore.getState().wallets.find((w) => w.id === id);
        // Switching between SMS and notification tracking would otherwise let
        // the new source re-apply transactions the old one already counted.
        if (before && updates.trackingMethod && updates.trackingMethod !== before.trackingMethod) {
          useReconcileStore.getState().advanceAnchor(id, Date.now());
        }
        set((state) => ({
          wallets: state.wallets.map((w) =>
            w.id === id ? { ...w, ...updates, updatedAt: new Date().toISOString() } : w
          ),
          dirty: true,
        }));
      },

      removeWallet: (id) => {
        useReconcileStore.getState().forgetWallet(id);
        set((state) => ({
          wallets: state.wallets.filter((w) => w.id !== id),
          pendingDeletes: state.pendingDeletes.includes(id)
            ? state.pendingDeletes
            : [...state.pendingDeletes, id],
        }));
      },

      // Used by cloud pulls — intentionally does NOT touch the dirty flag.
      setWallets: (wallets) => set({ wallets }),

      updateBalance: (id, balance) =>
        set((state) => ({
          wallets: state.wallets.map((w) =>
            w.id === id
              ? { ...w, balance, updatedAt: new Date().toISOString() }
              : w
          ),
          dirty: true,
        })),

      setBalanceManually: (id, balance) => {
        useReconcileStore.getState().advanceAnchor(id, Date.now());
        set((state) => ({
          wallets: state.wallets.map((w) =>
            w.id === id
              ? { ...w, balance, updatedAt: new Date().toISOString() }
              : w
          ),
          dirty: true,
        }));
      },

      completeOnboarding: () => set({ hasCompletedOnboarding: true }),

      resetOnboarding: () =>
        set((state) => {
          // Drop the reconciliation anchors too, so re-onboarding starts from
          // the new opening balances and never replays old messages on them.
          useReconcileStore.getState().reset();
          return {
            hasCompletedOnboarding: false,
            wallets: [],
            dirty: false,
            // Queue cloud deletion of the wiped wallets ("Reset All Data"
            // means everywhere, not just this device).
            pendingDeletes: [
              ...state.pendingDeletes,
              ...state.wallets.map((w) => w.id),
            ],
          };
        }),

      markSynced: () => set({ dirty: false }),

      confirmDeletes: (ids) =>
        set((state) => ({
          pendingDeletes: state.pendingDeletes.filter((id) => !ids.includes(id)),
        })),
    }),
    {
      name: 'flux-wallet-storage',
      storage: createJSONStorage(() => AsyncStorage),
      version: 2,
      migrate: (persisted, version) => {
        const state = persisted as Partial<WalletState>;
        if (!state) return persisted as WalletState;
        // v0 → v1: legacy wallets had slug ids like "jazzcash-<ts>-<i>", but
        // Supabase's wallets.id column is `uuid` — replace with real UUIDs.
        if (version < 1 && Array.isArray(state.wallets)) {
          state.wallets = state.wallets.map((w) =>
            isUuid(w.id) ? w : { ...w, id: uuidv4() }
          );
        }
        // v1 → v2: offline-sync bookkeeping fields.
        if (version < 2) {
          state.dirty = state.dirty ?? false;
          state.pendingDeletes = state.pendingDeletes ?? [];
        }
        return state as WalletState;
      },
    }
  )
);
