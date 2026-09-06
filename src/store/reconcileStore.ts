import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

// How many recently-applied ids we remember per source. The date cursor is the
// primary guard against re-applying an SMS, so this only has to cover the
// boundary; for notifications it also covers a scan that died after applying
// but before the native queue was acked.
const MAX_PROCESSED_IDS = 1000;

interface ReconcileState {
  // Once true, we have a baseline cursor and may apply deltas. Before that we
  // must NOT replay the historical inbox (the user's balance was set at
  // onboarding and already reflects past transactions).
  initialized: boolean;
  // Only inbox messages with date >= smsCursor are considered.
  smsCursor: number;
  // Inbox row ids already applied (most recent last).
  processedSmsIds: string[];
  // Notification entry ids already applied (most recent last).
  processedNotificationIds: string[];

  // Establish the baseline so future messages (date >= now) get applied.
  initCursor: (now: number) => void;
  // Record a completed SMS pass: advance the cursor, remember applied ids.
  commitSms: (newCursor: number, appliedIds: string[]) => void;
  // Record notification ids applied in a pass.
  commitNotifications: (appliedIds: string[]) => void;
  // Wipe state (e.g. on sign-out / wallet reset) so a fresh baseline is taken.
  reset: () => void;
}

const trim = (ids: string[]) =>
  ids.length > MAX_PROCESSED_IDS ? ids.slice(ids.length - MAX_PROCESSED_IDS) : ids;

export const useReconcileStore = create<ReconcileState>()(
  persist(
    (set) => ({
      initialized: false,
      smsCursor: 0,
      processedSmsIds: [],
      processedNotificationIds: [],

      initCursor: (now) =>
        set({
          initialized: true,
          smsCursor: now,
          processedSmsIds: [],
          processedNotificationIds: [],
        }),

      commitSms: (newCursor, appliedIds) =>
        set((state) => ({
          // Cursor never goes backwards.
          smsCursor: Math.max(state.smsCursor, newCursor),
          processedSmsIds: trim([...state.processedSmsIds, ...appliedIds]),
        })),

      commitNotifications: (appliedIds) =>
        set((state) => ({
          processedNotificationIds: trim([
            ...state.processedNotificationIds,
            ...appliedIds,
          ]),
        })),

      reset: () =>
        set({
          initialized: false,
          smsCursor: 0,
          processedSmsIds: [],
          processedNotificationIds: [],
        }),
    }),
    {
      name: 'flux-reconcile-storage',
      storage: createJSONStorage(() => AsyncStorage),
      version: 2,
      migrate: (persisted) => {
        const s = (persisted ?? {}) as Partial<ReconcileState>;
        if (!Array.isArray(s.processedNotificationIds)) {
          s.processedNotificationIds = [];
        }
        return s as ReconcileState;
      },
    }
  )
);
