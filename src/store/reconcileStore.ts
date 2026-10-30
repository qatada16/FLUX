import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { pruneProcessed } from '../lib/scanWindow';

interface ReconcileState {
  // walletId → epoch ms. The wallet's balance already accounts for every
  // message before this moment: set when the wallet is created, when
  // its balance is set by hand, and whenever a message states the balance.
  anchors: Record<string, number>;
  // Message key → message time (epoch ms) for every tracked message already
  // judged — applied, recognised as not-a-transaction, or handed to the AI
  // queue. A message with a key here is never applied again.
  processed: Record<string, number>;
  // Installs upgraded from the cursor-based scanner: where that cursor stood.
  // Used once, as the anchor for wallets that predate anchors, then cleared.
  legacyAnchor: number | null;

  // Anchors only ever move forward: a stated balance from an older message,
  // or a clock set back, must never rewind one. The scanner relies on this to
  // skip re-recording messages it has already found to be older than one.
  advanceAnchor: (walletId: string, at: number) => void;
  // Give every listed wallet without an anchor one, from `fallback`.
  ensureAnchors: (walletIds: string[], fallback: (walletId: string) => number) => void;
  markProcessed: (entries: Record<string, number>) => void;
  prune: (now: number) => void;
  forgetWallet: (walletId: string) => void;
  // Wipe state (e.g. on "Reset All Data").
  reset: () => void;
}

export const useReconcileStore = create<ReconcileState>()(
  persist(
    (set) => ({
      anchors: {},
      processed: {},
      legacyAnchor: null,

      advanceAnchor: (walletId, at) =>
        set((state) => {
          const current = state.anchors[walletId] ?? 0;
          if (at <= current) return state;
          return { anchors: { ...state.anchors, [walletId]: at } };
        }),

      ensureAnchors: (walletIds, fallback) =>
        set((state) => {
          const missing = walletIds.filter((id) => state.anchors[id] === undefined);
          if (missing.length === 0 && state.legacyAnchor === null) return state;
          const anchors = { ...state.anchors };
          for (const id of missing) anchors[id] = fallback(id);
          // The legacy cursor only describes wallets that existed at upgrade;
          // a wallet that turns up later (e.g. a cloud pull) starts fresh.
          return { anchors, legacyAnchor: null };
        }),

      markProcessed: (entries) =>
        set((state) => ({ processed: { ...state.processed, ...entries } })),

      prune: (now) => set((state) => ({ processed: pruneProcessed(state.processed, now) })),

      forgetWallet: (walletId) =>
        set((state) => {
          if (state.anchors[walletId] === undefined) return state;
          const anchors = { ...state.anchors };
          delete anchors[walletId];
          return { anchors };
        }),

      reset: () => set({ anchors: {}, processed: {}, legacyAnchor: null }),
    }),
    {
      name: 'flux-reconcile-storage',
      storage: createJSONStorage(() => AsyncStorage),
      version: 3,
      migrate: (persisted, version) => {
        if (version >= 3) return persisted as ReconcileState;
        // v1/v2 tracked a single forward-only SMS cursor. Everything at or
        // before it was already judged, so just past it is exactly the anchor
        // existing wallets need. Clamped to now: a cursor pushed into the
        // future by a mis-dated SMS is the bug this version exists to fix.
        const old = (persisted ?? {}) as { initialized?: boolean; smsCursor?: number };
        const legacyAnchor =
          old.initialized && typeof old.smsCursor === 'number' && old.smsCursor > 0
            ? Math.min(old.smsCursor + 1, Date.now())
            : null;
        return { anchors: {}, processed: {}, legacyAnchor } as unknown as ReconcileState;
      },
    }
  )
);
