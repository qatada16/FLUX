import type { Wallet } from '../types/wallet';
import type { ParseResult } from './parsers/types';
import { useWalletStore } from '../store/walletStore';
import { useAuthStore } from '../store/authStore';
import { useAiQueueStore } from '../store/aiQueueStore';
import { useReconcileStore } from '../store/reconcileStore';
import { AI_PROVIDER_LABELS } from '../store/aiKeysStore';
import { pushBalanceUpdate } from './sync';
import { recordTransaction } from './transactionSync';
import { getParserForProvider } from './parsers';
import { parseMessageWithAi, hasAiKeys } from './aiParser';
import { containsPossibleAmount } from './aiPrefilter';
import { isReflectedInBalance } from './scanWindow';
import type { TransactionNotice } from './notify';

export type MessageSource = 'sms' | 'notification';

/** One SMS or wallet-app notification, as the scanner hands it over. */
export interface IncomingMessage {
  source: MessageSource;
  body: string;
  at: number; // epoch ms the message arrived
}

export type ApplyOutcome =
  | { kind: 'applied'; notice: TransactionNotice }
  // Before the wallet's anchor: already part of the balance.
  | { kind: 'reflected' }
  // Not a transaction (OTP, promo, balance enquiry…).
  | { kind: 'ignored' }
  // Needs AI but no provider answered; parked in the retry queue.
  | { kind: 'queued' };

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

function anchorOf(walletId: string): number {
  return useReconcileStore.getState().anchors[walletId] ?? 0;
}

/**
 * Parses one message for one wallet and, if it is a transaction the balance
 * doesn't include yet, applies it.
 */
export async function applyMessageToWallet(wallet: Wallet, msg: IncomingMessage): Promise<ApplyOutcome> {
  // Checked before parsing so old messages never cost an AI call.
  if (isReflectedInBalance(msg.at, anchorOf(wallet.id))) return { kind: 'reflected' };

  const parser = getParserForProvider(wallet.providerKey);
  let result = parser ? parser.parse(msg.body) : null;
  let aiProvider: string | undefined;

  if (!result) {
    // Only involve AI when keys exist and the text actually holds a number —
    // promos with no figures never reach a provider.
    if (!hasAiKeys() || !containsPossibleAmount(msg.body)) return { kind: 'ignored' };

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
        source: msg.source,
        body: msg.body,
        timestamp: msg.at,
      });
      return { kind: 'queued' };
    }

    if (!result) return { kind: 'ignored' };
  }

  return applyResult(wallet.id, result, msg.at, msg.source, aiProvider);
}

/**
 * Moves a wallet's balance by one parsed transaction.
 *
 * A stated balance ("Avl Bal Rs.X") is applied as an absolute and becomes the
 * wallet's new anchor, so anything older that turns up later — a late SMS, an
 * AI retry — is recognised as already included instead of being applied on
 * top of a balance that contains it.
 */
function applyResult(
  walletId: string,
  parsed: ParseResult,
  at: number,
  source: MessageSource,
  aiProvider?: string
): ApplyOutcome {
  // Re-read: earlier messages in the same scan may have moved the balance.
  const wallet = useWalletStore.getState().wallets.find((w) => w.id === walletId);
  if (!wallet) return { kind: 'ignored' };
  if (isReflectedInBalance(at, anchorOf(walletId))) return { kind: 'reflected' };

  let amount = parsed.amount;
  let direction = parsed.direction;
  let newBalance: number;

  if (parsed.newBalance !== undefined) {
    newBalance = round2(parsed.newBalance);
    useReconcileStore.getState().advanceAnchor(walletId, at);
    // The wallet already shows the stated balance (e.g. it was set by hand
    // just after the payment), so this transaction is already counted.
    if (newBalance === wallet.balance) return { kind: 'reflected' };
    // AI sometimes finds only the balance; the amount is then the difference.
    if (!amount) {
      const delta = newBalance - wallet.balance;
      amount = Math.abs(delta);
      direction = delta >= 0 ? 'credit' : 'debit';
    }
  } else {
    newBalance = round2(direction === 'credit' ? wallet.balance + amount : wallet.balance - amount);
  }

  amount = round2(amount);
  if (amount <= 0) return { kind: 'ignored' };

  console.log(
    `[Scan] ${wallet.displayName}: ${direction} Rs.${amount} → new balance Rs.${newBalance}`
  );

  useWalletStore.getState().updateBalance(wallet.id, newBalance);

  const isAiParsed = !!aiProvider;
  recordTransaction(
    {
      walletId: wallet.id,
      walletName: wallet.displayName,
      amount,
      direction,
      balanceAfter: newBalance,
      source: isAiParsed ? (source === 'sms' ? 'ai_sms' : 'ai_notification') : source,
    },
    at
  );

  if (useAuthStore.getState().user) {
    void pushBalanceUpdate(wallet.id, newBalance);
  }

  return {
    kind: 'applied',
    notice: {
      walletName: wallet.displayName,
      amount,
      direction,
      balanceAfter: newBalance,
      aiProvider,
      at,
    },
  };
}

let isProcessingQueue = false;

/**
 * Retries messages that needed AI while no provider was reachable, oldest
 * first. Stops at the first network failure — the rest wait for next time.
 */
export async function processPendingAiQueue(): Promise<ApplyOutcome[]> {
  if (isProcessingQueue || !hasAiKeys()) return [];
  isProcessingQueue = true;

  const outcomes: ApplyOutcome[] = [];
  try {
    const pending = [...useAiQueueStore.getState().pendingMessages].sort(
      (a, b) => a.timestamp - b.timestamp
    );

    for (const item of pending) {
      // Already covered by a newer stated or hand-set balance: don't spend a call.
      if (isReflectedInBalance(item.timestamp, anchorOf(item.walletId))) {
        useAiQueueStore.getState().dequeueMessage(item.id);
        outcomes.push({ kind: 'reflected' });
        continue;
      }

      let outcome: Awaited<ReturnType<typeof parseMessageWithAi>>;
      try {
        outcome = await parseMessageWithAi(item.body);
      } catch {
        break; // still offline
      }

      if (outcome) {
        outcomes.push(
          applyResult(
            item.walletId,
            outcome.result,
            item.timestamp,
            item.source,
            AI_PROVIDER_LABELS[outcome.provider]
          )
        );
      } else {
        outcomes.push({ kind: 'ignored' });
      }
      useAiQueueStore.getState().dequeueMessage(item.id);
    }
  } finally {
    isProcessingQueue = false;
  }
  return outcomes;
}
