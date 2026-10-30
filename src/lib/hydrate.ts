import { useAiKeysStore } from '../store/aiKeysStore';
import { useAiQueueStore } from '../store/aiQueueStore';
import { useReconcileStore } from '../store/reconcileStore';
import { useSettingsStore } from '../store/settingsStore';
import { useTransactionStore } from '../store/transactionStore';
import { useWalletStore } from '../store/walletStore';

// Every store whose contents a scan reads or writes.
const persistedStores = [
  useSettingsStore,
  useReconcileStore,
  useWalletStore,
  useTransactionStore,
  useAiQueueStore,
  useAiKeysStore,
];

// Zustand never signals completion when a load fails, so a wait needs a limit.
const HYDRATION_TIMEOUT_MS = 5000;

type PersistedStore = (typeof persistedStores)[number];

function waitForHydration(store: PersistedStore): Promise<void> {
  if (store.persist.hasHydrated()) return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      unsubscribe();
      resolve();
    };
    const timer = setTimeout(done, HYDRATION_TIMEOUT_MS);
    const unsubscribe = store.persist.onFinishHydration(done);
    // Covers hydration finishing between the first check and subscribing.
    if (store.persist.hasHydrated()) done();
  });
}

/**
 * Waits until the persisted stores have loaded from AsyncStorage.
 *
 * Zustand starts loading every store as soon as it is created, but finishes
 * asynchronously, so an entry point that runs immediately (app boot, the
 * headless background task) would otherwise see empty state: no wallets, no
 * anchors, no record of which messages were already applied.
 *
 * This waits for the load already in progress rather than starting another —
 * a second load could overwrite a change made in between.
 */
export async function ensureStoresHydrated(): Promise<void> {
  await Promise.all(persistedStores.map(waitForHydration));
}

/** Whether every persisted store has finished loading. */
export function storesHydrated(): boolean {
  return persistedStores.every((store) => store.persist.hasHydrated());
}
