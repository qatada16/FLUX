import {
  addSmsListener,
  startListening,
  isAvailable,
  checkSmsPermission,
  readMessagesSince,
} from '../../modules/sms-listener';
import type { SmsReceivedEvent, SmsInboxMessage } from '../../modules/sms-listener';
import { useWalletStore } from '../store/walletStore';
import { useAuthStore } from '../store/authStore';
import { useReconcileStore } from '../store/reconcileStore';
import { useAiQueueStore } from '../store/aiQueueStore';
import { pushBalanceUpdate } from './sync';
import { recordTransaction } from './transactionSync';
import { getParserForProvider } from './parsers';
import { parseMessageWithAi, processPendingAiQueue, hasAiKeys } from './aiParser';
import { containsPossibleAmount } from './aiPrefilter';
import { notifyTransaction } from './notify';
import { AI_PROVIDER_LABELS } from '../store/aiKeysStore';

let unsubscribe: (() => void) | null = null;
let reconcileTimer: ReturnType<typeof setTimeout> | null = null;
let reconciling = false;
let rerunQueued = false;

export function initSmsListener(): void {
  if (!isAvailable) return;
  if (unsubscribe) return;

  startListening();

  unsubscribe = addSmsListener((_event: SmsReceivedEvent) => {
    scheduleReconcile();
  });

  void reconcileSms();
}

export function teardownSmsListener(): void {
  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }
  if (reconcileTimer) {
    clearTimeout(reconcileTimer);
    reconcileTimer = null;
  }
}

export function scheduleReconcile(delayMs = 1500): void {
  if (reconcileTimer) clearTimeout(reconcileTimer);
  reconcileTimer = setTimeout(() => {
    reconcileTimer = null;
    void reconcileSms();
  }, delayMs);
}

export async function reconcileSms(): Promise<void> {
  if (!isAvailable) return;

  if (reconciling) {
    rerunQueued = true;
    return;
  }
  reconciling = true;
  try {
    const granted = await checkSmsPermission();
    if (!granted) return;

    const recon = useReconcileStore.getState();

    if (!recon.initialized) {
      recon.initCursor(Date.now());
      return;
    }

    const messages = await readMessagesSince(recon.smsCursor);
    if (messages.length > 0) {
      const processed = new Set(recon.processedSmsIds);
      const appliedIds: string[] = [];
      let maxDate = recon.smsCursor;

      for (const msg of messages) {
        if (msg.date > maxDate) maxDate = msg.date;
        if (processed.has(msg.id)) continue;
        await applySmsToWallets(msg);
        appliedIds.push(msg.id);
        processed.add(msg.id);
      }

      useReconcileStore.getState().commit(maxDate, appliedIds);
    }

    void processPendingAiQueue();
  } catch (err) {
    console.error('[SMS] reconcile failed:', err);
  } finally {
    reconciling = false;
    if (rerunQueued) {
      rerunQueued = false;
      void reconcileSms();
    }
  }
}

async function applySmsToWallets(msg: SmsInboxMessage): Promise<void> {
  const wallets = useWalletStore.getState().wallets;

  const matchingWallets = wallets.filter((w) => {
    if (w.trackingMethod !== 'sms' || !w.smsSender) return false;
    const senders = w.smsSender.split(',').map((s) => normalizeSender(s.trim()));
    return senders.includes(normalizeSender(msg.sender));
  });

  if (matchingWallets.length === 0) return;

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
      void notifyTransaction({
        walletName: wallet.displayName,
        amount: result.amount,
        direction: result.direction,
        balanceAfter: newBalance,
        aiProvider,
      });
    }

    const user = useAuthStore.getState().user;
    if (user) {
      void pushBalanceUpdate(wallet.id, newBalance);
    }
  }
}

function normalizeSender(sender: string): string {
  return sender.replace(/[\s+\-()]/g, '').toLowerCase();
}
