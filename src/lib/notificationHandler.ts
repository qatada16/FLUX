import { useWalletStore } from '../store/walletStore';
import { useAuthStore } from '../store/authStore';
import { useAiQueueStore } from '../store/aiQueueStore';
import { pushBalanceUpdate } from './sync';
import { recordTransaction } from './transactionSync';
import { getParserForProvider } from './parsers';
import { parseMessageWithAi, hasAiKeys } from './aiParser';
import { containsPossibleAmount } from './aiPrefilter';
import { notifyTransaction } from './notify';
import { AI_PROVIDER_LABELS } from '../store/aiKeysStore';

// One notification drained from the native capture queue.
export interface CapturedNotification {
  packageName: string;
  title: string;
  text: string;
  timestamp: number;
}

/**
 * Applies one captured notification to every wallet watching that package.
 * Called only by the catch-up scanner, which handles de-duplication before
 * anything reaches here.
 *
 * Returns true when at least one wallet balance moved.
 */
export async function applyNotificationToWallets(
  event: CapturedNotification,
  options: { notify: boolean }
): Promise<boolean> {
  const wallets = useWalletStore.getState().wallets;

  const matchingWallets = wallets.filter(
    (w) =>
      w.trackingMethod === 'notification' &&
      w.notificationPackage &&
      w.notificationPackage === event.packageName
  );

  if (matchingWallets.length === 0) return false;

  let applied = false;

  const fullText = [event.title, event.text].filter(Boolean).join(' ');

  for (const wallet of matchingWallets) {
    const parser = getParserForProvider(wallet.providerKey);
    let result = parser ? parser.parse(fullText) : null;
    let aiProvider: string | undefined;

    if (!result) {
      // Only involve AI when keys exist and the text actually holds a number.
      if (!hasAiKeys() || !containsPossibleAmount(fullText)) continue;

      try {
        const outcome = await parseMessageWithAi(fullText);
        if (outcome) {
          result = outcome.result;
          aiProvider = AI_PROVIDER_LABELS[outcome.provider];
        }
      } catch {
        useAiQueueStore.getState().enqueueMessage({
          walletId: wallet.id,
          walletName: wallet.displayName,
          providerKey: wallet.providerKey,
          source: 'notification',
          body: fullText,
          timestamp: event.timestamp,
        });
        continue;
      }

      if (!result) {
        continue;
      }
    }

    const isAiParsed = !!aiProvider;

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
      if (options.notify) {
        void notifyTransaction({
          walletName: wallet.displayName,
          amount: result.amount,
          direction: result.direction,
          balanceAfter: newBalance,
          aiProvider,
        });
      }
    }

    applied = true;

    const user = useAuthStore.getState().user;
    if (user) {
      void pushBalanceUpdate(wallet.id, newBalance);
    }
  }

  return applied;
}
