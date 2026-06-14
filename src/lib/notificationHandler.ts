import {
  addNotificationListener,
  startListening,
  isAvailable,
} from '../../modules/notification-listener';
import type { NotificationReceivedEvent } from '../../modules/notification-listener';
import { useWalletStore } from '../store/walletStore';
import { useAuthStore } from '../store/authStore';
import { pushBalanceUpdate } from './sync';
import { getParserForProvider } from './parsers';

let unsubscribe: (() => void) | null = null;

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

    const newBalance =
      result.direction === 'credit'
        ? wallet.balance + result.amount
        : wallet.balance - result.amount;

    console.log(
      `[Notification] ${wallet.displayName}: ${result.direction} Rs.${result.amount} → new balance Rs.${newBalance}`
    );

    useWalletStore.getState().updateBalance(wallet.id, newBalance);

    // Sync to cloud in background
    const user = useAuthStore.getState().user;
    if (user) {
      pushBalanceUpdate(wallet.id, newBalance);
    }
  }
}
