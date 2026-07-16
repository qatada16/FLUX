import {
  addNotificationListener,
  startListening,
  isAvailable,
} from '../../modules/notification-listener';
import type { NotificationReceivedEvent } from '../../modules/notification-listener';
import { useWalletStore } from '../store/walletStore';
import { useAuthStore } from '../store/authStore';
import { pushBalanceUpdate } from './sync';
import { recordTransaction } from './transactionSync';
import { getParserForProvider } from './parsers';

let unsubscribe: (() => void) | null = null;

// Android apps often re-post (update) the same notification — progress
// updates, "silent" refreshes, or the summary re-appearing after unlock.
// Applying the same transaction twice would corrupt the balance, so we
// remember recently-seen content and skip repeats inside a short window.
const DEDUP_WINDOW_MS = 5 * 60 * 1000;
const MAX_DEDUP_ENTRIES = 100;
const recentNotifications = new Map<string, number>();

function isDuplicateNotification(event: NotificationReceivedEvent): boolean {
  const key = `${event.packageName}|${event.title}|${event.text}`;
  const now = Date.now();

  const seenAt = recentNotifications.get(key);
  if (seenAt !== undefined && now - seenAt < DEDUP_WINDOW_MS) {
    return true;
  }

  recentNotifications.set(key, now);
  // Prune: drop expired entries, then oldest if still over cap.
  if (recentNotifications.size > MAX_DEDUP_ENTRIES) {
    for (const [k, t] of recentNotifications) {
      if (now - t >= DEDUP_WINDOW_MS) recentNotifications.delete(k);
    }
    while (recentNotifications.size > MAX_DEDUP_ENTRIES) {
      const oldest = recentNotifications.keys().next().value;
      if (oldest === undefined) break;
      recentNotifications.delete(oldest);
    }
  }
  return false;
}

/**
 * Start the notification listener and wire it to the parser + wallet store.
 * Call this once after notification access is granted.
 */
export function initNotificationListener(): void {
  if (!isAvailable) return;
  if (unsubscribe) return; // Already initialized

  startListening();

  unsubscribe = addNotificationListener((event: NotificationReceivedEvent) => {
    handleIncomingNotification(event);
  });
}

/**
 * Stop the notification listener.
 */
export function teardownNotificationListener(): void {
  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }
}

/**
 * Process an incoming notification against configured wallets.
 */
function handleIncomingNotification(event: NotificationReceivedEvent): void {
  if (isDuplicateNotification(event)) return;

  const wallets = useWalletStore.getState().wallets;

  // Find wallets that use notification tracking and match this package
  const matchingWallets = wallets.filter(
    (w) =>
      w.trackingMethod === 'notification' &&
      w.notificationPackage &&
      w.notificationPackage === event.packageName
  );

  if (matchingWallets.length === 0) return;

  // Combine title and text for parsing (some apps put amounts in titles)
  const fullText = [event.title, event.text].filter(Boolean).join(' ');

  for (const wallet of matchingWallets) {
    const parser = getParserForProvider(wallet.providerKey);
    if (!parser) continue;

    const result = parser.parse(fullText);
    if (!result) continue;

    // Prefer the absolute balance stated in the notification when present.
    const newBalance =
      result.newBalance ??
      (result.direction === 'credit'
        ? wallet.balance + result.amount
        : wallet.balance - result.amount);

    console.log(
      `[Notification] ${wallet.displayName}: ${result.direction} Rs.${result.amount} → new balance Rs.${newBalance}`
    );

    useWalletStore.getState().updateBalance(wallet.id, newBalance);

    // Log the transaction to history (offline-first; syncs when online).
    recordTransaction({
      walletId: wallet.id,
      walletName: wallet.displayName,
      amount: result.amount,
      direction: result.direction,
      balanceAfter: newBalance,
      source: 'notification',
    });

    // Sync to cloud in background
    const user = useAuthStore.getState().user;
    if (user) {
      void pushBalanceUpdate(wallet.id, newBalance);
    }
  }
}
