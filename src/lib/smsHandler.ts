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
import { pushBalanceUpdate } from './sync';
import { recordTransaction } from './transactionSync';
import { getParserForProvider } from './parsers';

let unsubscribe: (() => void) | null = null;
let reconcileTimer: ReturnType<typeof setTimeout> | null = null;
let reconciling = false;
let rerunQueued = false;

/**
 * Start the SMS listener.
 *
 * IMPORTANT: the live broadcast is NOT used to mutate balances directly.
 * Android writes every received SMS to the system inbox regardless of internet
 * connectivity, so the inbox — not the broadcast — is our source of truth. The
 * broadcast is only a low-latency *poke* that schedules a reconciliation pass
 * (debounced, with a small delay so Android has finished writing to the inbox).
 * This gives near-instant updates while guaranteeing exactly-once application.
 */
export function initSmsListener(): void {
  if (!isAvailable) return;
  if (unsubscribe) return; // Already initialized

  startListening();

  unsubscribe = addSmsListener((_event: SmsReceivedEvent) => {
    scheduleReconcile();
  });

  // Catch up on anything missed while the app was closed/killed.
  void reconcileSms();
}

/**
 * Stop the SMS listener.
 */
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

/**
 * Debounced trigger used by the live broadcast. Waits briefly so the OS has
 * persisted the message to the inbox before we read it back.
 */
export function scheduleReconcile(delayMs = 1500): void {
  if (reconcileTimer) clearTimeout(reconcileTimer);
  reconcileTimer = setTimeout(() => {
    reconcileTimer = null;
    void reconcileSms();
  }, delayMs);
}

/**
 * Reconcile local balances against the device SMS inbox.
 *
 * Reads every inbox message at/after the saved cursor, applies the ones we
 * haven't seen (deduped by stable inbox row id), then advances the cursor.
 * Safe to call as often as we like — it is idempotent. Triggered on app
 * startup, on app foreground, and (debounced) on each live SMS.
 */
export async function reconcileSms(): Promise<void> {
  if (!isAvailable) return;

  // Guard against overlapping passes; if asked again mid-flight, run once more
  // afterwards so we never drop a trigger.
  if (reconciling) {
    rerunQueued = true;
    return;
  }
  reconciling = true;
  try {
    const granted = await checkSmsPermission();
    if (!granted) return;

    const recon = useReconcileStore.getState();

    // First ever run: take a baseline. We deliberately do NOT replay history —
    // the onboarding balance already accounts for past transactions.
    if (!recon.initialized) {
      recon.initCursor(Date.now());
      return;
    }

    const messages = await readMessagesSince(recon.smsCursor);
    if (messages.length === 0) return;

    const processed = new Set(recon.processedSmsIds);
    const appliedIds: string[] = [];
    let maxDate = recon.smsCursor;

    for (const msg of messages) {
      if (msg.date > maxDate) maxDate = msg.date;
      if (processed.has(msg.id)) continue; // already applied
      applySmsToWallets(msg);
      // Mark as handled even if it matched no wallet / wasn't a transaction, so
      // we don't re-parse it on every pass.
      appliedIds.push(msg.id);
      processed.add(msg.id);
    }

    useReconcileStore.getState().commit(maxDate, appliedIds);
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

/**
 * Apply a single inbox message to any wallets that track its sender.
 */
function applySmsToWallets(msg: SmsInboxMessage): void {
  const wallets = useWalletStore.getState().wallets;

  // Find wallets that use SMS tracking and match this sender. smsSender may be
  // a comma-separated list of shortcodes (a bank can send from several).
  const matchingWallets = wallets.filter((w) => {
    if (w.trackingMethod !== 'sms' || !w.smsSender) return false;
    const senders = w.smsSender.split(',').map((s) => normalizeSender(s.trim()));
    return senders.includes(normalizeSender(msg.sender));
  });

  if (matchingWallets.length === 0) return;

  for (const wallet of matchingWallets) {
    const parser = getParserForProvider(wallet.providerKey);
    if (!parser) continue;

    const result = parser.parse(msg.body);
    if (!result) continue; // Couldn't parse or non-transactional

    // Prefer the absolute balance stated in the SMS ("new balance Rs.X") —
    // it self-corrects any drift. Fall back to applying the delta.
    const newBalance =
      result.newBalance ??
      (result.direction === 'credit'
        ? wallet.balance + result.amount
        : wallet.balance - result.amount);

    console.log(
      `[SMS] ${wallet.displayName}: ${result.direction} Rs.${result.amount} → new balance Rs.${newBalance}`
    );

    useWalletStore.getState().updateBalance(wallet.id, newBalance);

    // Log the transaction to history (offline-first; syncs when online).
    recordTransaction({
      walletId: wallet.id,
      walletName: wallet.displayName,
      amount: result.amount,
      direction: result.direction,
      balanceAfter: newBalance,
      source: 'sms',
    });

    // Sync to cloud in background. If offline this fails silently; the local
    // store is already updated and the cloud catches up on the next push.
    const user = useAuthStore.getState().user;
    if (user) {
      void pushBalanceUpdate(wallet.id, newBalance);
    }
  }
}

/**
 * Normalize sender ID for comparison (strip spaces, +, dashes).
 */
function normalizeSender(sender: string): string {
  return sender.replace(/[\s+\-()]/g, '').toLowerCase();
}
