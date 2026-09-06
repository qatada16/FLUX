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

/**
 * Waits until the persisted stores have loaded from AsyncStorage.
 *
 * Zustand rehydrates asynchronously, so a headless entry point (the daily
 * background task) can otherwise observe empty state: no wallets, and — worst
 * of all — an uninitialised reconcile cursor, which would take a fresh
 * baseline and throw away the record of what had already been applied.
 */
export async function ensureStoresHydrated(): Promise<void> {
  await Promise.all(
    persistedStores.map((store) =>
      store.persist.hasHydrated() ? Promise.resolve() : store.persist.rehydrate()
    )
  );
}

/** Whether every persisted store has finished loading. */
export function storesHydrated(): boolean {
  return persistedStores.every((store) => store.persist.hasHydrated());
}
