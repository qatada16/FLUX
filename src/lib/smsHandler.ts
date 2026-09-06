import type { SmsInboxMessage } from '../../modules/sms-listener';
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

/**
 * Applies one inbox SMS to every wallet whose sender ids match it. Called only
 * by the catch-up scanner — there is no live SMS receiver any more.
 *
 * Returns true when at least one wallet balance moved.
 */
export async function applySmsToWallets(
  msg: SmsInboxMessage,
  options: { notify: boolean }
): Promise<boolean> {
  const wallets = useWalletStore.getState().wallets;

  const matchingWallets = wallets.filter((w) => {
    if (w.trackingMethod !== 'sms' || !w.smsSender) return false;
    const senders = w.smsSender.split(',').map((s) => normalizeSender(s.trim()));
    return senders.includes(normalizeSender(msg.sender));
  });

  if (matchingWallets.length === 0) return false;

  let applied = false;

  for (const wallet of matchingWallets) {
    const parser = getParserForProvider(wallet.providerKey);
    let result = parser ? parser.parse(msg.body) : null;
    let aiProvider: string | undefined;

    if (!result) {
      // Only involve AI when keys exist and the text actually holds a number —
      // promos with no figures never reach a provider.
      if (!hasAiKeys() || !containsPossibleAmount(msg.body)) continue;

      try {
        const outcome = await parseMessageWithAi(msg.body);
        if (outcome) {
          result = outcome.result;
          aiProvider = AI_PROVIDER_LABELS[outcome.provider];
        }
      } catch {
        useAiQueueStore.getState().enqueueMessage({
          walletId: wallet.id,
          walletName: wallet.displayName,
          providerKey: wallet.providerKey,
          source: 'sms',
          body: msg.body,
          timestamp: msg.date,
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
      `[SMS] ${wallet.displayName}: ${result.direction} Rs.${result.amount} → new balance Rs.${newBalance}`
    );

    useWalletStore.getState().updateBalance(wallet.id, newBalance);

    if (result.amount > 0) {
      recordTransaction({
        walletId: wallet.id,
        walletName: wallet.displayName,
        amount: result.amount,
        direction: result.direction,
        balanceAfter: newBalance,
        source: isAiParsed ? 'ai_sms' : 'sms',
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

function normalizeSender(sender: string): string {
  return sender.replace(/[\s+\-()]/g, '').toLowerCase();
}
