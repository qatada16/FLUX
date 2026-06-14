import { addSmsListener, startListening, isAvailable } from '../../modules/sms-listener';
import type { SmsReceivedEvent } from '../../modules/sms-listener';
import { useWalletStore } from '../store/walletStore';
import { useAuthStore } from '../store/authStore';
import { pushBalanceUpdate } from './sync';
import { getParserForProvider } from './parsers';

let unsubscribe: (() => void) | null = null;

/**
 * Start the SMS listener and wire it to the parser + wallet store.
 * Call this once after permissions are granted.
 */
export function initSmsListener(): void {
  if (!isAvailable) return;
  if (unsubscribe) return; // Already initialized

  startListening();

  unsubscribe = addSmsListener((event: SmsReceivedEvent) => {
    handleIncomingSms(event);
  });
}

/**
 * Stop the SMS listener.
 */
export function teardownSmsListener(): void {
  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }
}

/**
 * Process an incoming SMS against configured wallets.
 */
function handleIncomingSms(event: SmsReceivedEvent): void {
  const wallets = useWalletStore.getState().wallets;

  // Find wallets that use SMS tracking and match this sender
  const matchingWallets = wallets.filter(
    (w) =>
      w.trackingMethod === 'sms' &&
      w.smsSender &&
      normalizeSender(event.sender) === normalizeSender(w.smsSender)
  );

  if (matchingWallets.length === 0) return;

  for (const wallet of matchingWallets) {
    const parser = getParserForProvider(wallet.providerKey);
    if (!parser) continue;

    const result = parser.parse(event.body);
    if (!result) continue; // Couldn't parse or non-transactional

    // Update balance
    const newBalance =
      result.direction === 'credit'
        ? wallet.balance + result.amount
        : wallet.balance - result.amount;

    console.log(
      `[SMS] ${wallet.displayName}: ${result.direction} Rs.${result.amount} → new balance Rs.${newBalance}`
    );

    useWalletStore.getState().updateBalance(wallet.id, newBalance);

    // Sync to cloud in background
    const user = useAuthStore.getState().user;
    if (user) {
      pushBalanceUpdate(wallet.id, newBalance);
    }
  }
}

/**
 * Normalize sender ID for comparison (strip spaces, +, dashes).
 */
function normalizeSender(sender: string): string {
  return sender.replace(/[\s+\-()]/g, '').toLowerCase();
}
