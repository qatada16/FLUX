import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

// How many recently-processed inbox ids we remember. This is only a boundary
// guard against double-applying a message that sits exactly on the cursor; the
// date cursor does the heavy lifting, so a small ring is plenty.
const MAX_PROCESSED_IDS = 500;

interface ReconcileState {
  // Once true, we have a baseline cursor and may apply deltas. Before that we
  // must NOT replay the entire historical inbox (the user's balance was set at
  // onboarding and already reflects past transactions).
  initialized: boolean;
  // Only inbox messages with date >= smsCursor are considered.
  smsCursor: number;
  // Inbox row ids already applied (most recent last).
  processedSmsIds: string[];

  // Establish the baseline so future messages (date >= now) get applied.
  initCursor: (now: number) => void;
  // Record a completed reconciliation pass: advance the cursor and remember
  // which ids were applied.
  commit: (newCursor: number, appliedIds: string[]) => void;
  // Wipe state (e.g. on sign-out / wallet reset) so a fresh baseline is taken.
  reset: () => void;
}

export const useReconcileStore = create<ReconcileState>()(
  persist(
    (set) => ({
      initialized: false,
      smsCursor: 0,
      processedSmsIds: [],

      initCursor: (now) =>
        set({ initialized: true, smsCursor: now, processedSmsIds: [] }),

      commit: (newCursor, appliedIds) =>
        set((state) => {
          const merged = [...state.processedSmsIds, ...appliedIds];
          const trimmed =
            merged.length > MAX_PROCESSED_IDS
              ? merged.slice(merged.length - MAX_PROCESSED_IDS)
              : merged;
          return {
            // Cursor never goes backwards.
            smsCursor: Math.max(state.smsCursor, newCursor),
            processedSmsIds: trimmed,
          };
        }),

      reset: () =>
        set({ initialized: false, smsCursor: 0, processedSmsIds: [] }),
    }),
    {
      name: 'flux-reconcile-storage',
      storage: createJSONStorage(() => AsyncStorage),
      version: 1,
    }
  )
);
