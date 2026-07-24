import {
  addNotificationListener,
  startListening,
  isAvailable,
} from '../../modules/notification-listener';
import type { NotificationReceivedEvent } from '../../modules/notification-listener';
import { useWalletStore } from '../store/walletStore';
import { useAuthStore } from '../store/authStore';
import { useAiQueueStore } from '../store/aiQueueStore';
import { pushBalanceUpdate } from './sync';
import { recordTransaction } from './transactionSync';
import { getParserForProvider } from './parsers';
import { parseMessageWithAi } from './aiParser';

let unsubscribe: (() => void) | null = null;

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

export function initNotificationListener(): void {
  if (!isAvailable) return;
  if (unsubscribe) return;

  startListening();

  unsubscribe = addNotificationListener((event: NotificationReceivedEvent) => {
    void handleIncomingNotification(event);
  });
}

export function teardownNotificationListener(): void {
  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }
}

async function handleIncomingNotification(event: NotificationReceivedEvent): Promise<void> {
  if (isDuplicateNotification(event)) return;

  const wallets = useWalletStore.getState().wallets;

  const matchingWallets = wallets.filter(
    (w) =>
      w.trackingMethod === 'notification' &&
      w.notificationPackage &&
      w.notificationPackage === event.packageName
  );

  if (matchingWallets.length === 0) return;

  const fullText = [event.title, event.text].filter(Boolean).join(' ');

  for (const wallet of matchingWallets) {
    const parser = getParserForProvider(wallet.providerKey);
    let result = parser ? parser.parse(fullText) : null;
    let isAiParsed = false;

    if (!result) {
      try {
        result = await parseMessageWithAi(fullText);
        if (result) isAiParsed = true;
      } catch {
        useAiQueueStore.getState().enqueueMessage({
          walletId: wallet.id,
          walletName: wallet.displayName,
          providerKey: wallet.providerKey,
          source: 'notification',
          body: fullText,
          timestamp: Date.now(),
        });
        continue;
      }

      if (!result) {
        continue;
      }
    }

    // Infer amount & direction from balance delta if AI only detected New_Amount
    if (isAiParsed && (!result.amount || result.amount === 0) && result.newBalance !== undefined) {
      const delta = result.newBalance - wallet.balance;
      if (delta !== 0) {
        result.amount = Math.abs(delta);
        result.direction = delta > 0 ? 'credit' : 'debit';
      }
    }

    const newBalance =
      result.newBalance ??
      (result.direction === 'credit'
        ? wallet.balance + result.amount
        : wallet.balance - result.amount);

    console.log(
      `[Notification] ${wallet.displayName}: ${result.direction} Rs.${result.amount} → new balance Rs.${newBalance}`
    );

    useWalletStore.getState().updateBalance(wallet.id, newBalance);

    if (result.amount > 0) {
      recordTransaction({
        walletId: wallet.id,
        walletName: wallet.displayName,
        amount: result.amount,
        direction: result.direction,
        balanceAfter: newBalance,
        source: isAiParsed ? 'ai_notification' : 'notification',
      });
    }

    const user = useAuthStore.getState().user;
    if (user) {
      void pushBalanceUpdate(wallet.id, newBalance);
    }
  }
}
