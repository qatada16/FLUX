import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

const CHANNEL_ID = 'flux-transactions';
let channelReady = false;

export interface TransactionNotice {
  walletName: string;
  amount: number;
  direction: 'credit' | 'debit';
  balanceAfter: number;
  /** Display name of the AI provider, when detection came from AI. */
  aiProvider?: string;
  /** When the transaction happened (epoch ms); defaults to now. */
  at?: number;
}

// Beyond this many transactions in one scan (e.g. the first catch-up after a
// few days away), one summary replaces a stack of individual alerts.
const MAX_INDIVIDUAL_ALERTS = 3;

/**
 * Prepare the notification handler and channel. Never prompts, so it is safe
 * from the headless background task, where there is no screen to prompt on.
 */
async function ensureChannel(): Promise<void> {
  if (channelReady) return;
  try {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: false,
        shouldSetBadge: false,
      }),
    });

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
        name: 'Transactions',
        importance: Notifications.AndroidImportance.DEFAULT,
        sound: null,
        vibrationPattern: [0, 200],
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
      });
    }
    channelReady = true;
  } catch (err) {
    console.error('[Notify] channel setup failed:', err);
  }
}

/**
 * Prepare notifications and ask for permission if Android still allows
 * asking. Call from the UI only.
 */
export async function initNotifications(): Promise<void> {
  await ensureChannel();
  try {
    const { status, canAskAgain } = await Notifications.getPermissionsAsync();
    if (status !== 'granted' && canAskAgain) await Notifications.requestPermissionsAsync();
  } catch (err) {
    console.error('[Notify] permission request failed:', err);
  }
}

function formatPkr(value: number): string {
  return value.toLocaleString('en-PK', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatTime(at: number | undefined): string {
  const date = new Date(at ?? Date.now());
  const time = date.toLocaleTimeString('en-PK', { hour: 'numeric', minute: '2-digit', hour12: true });
  // A catch-up scan can surface something from an earlier day — say which.
  if (date.toDateString() === new Date().toDateString()) return time;
  return `${date.toLocaleDateString('en-PK', { day: 'numeric', month: 'short' })}, ${time}`;
}

async function canPost(): Promise<boolean> {
  await ensureChannel();
  const { status } = await Notifications.getPermissionsAsync();
  return status === 'granted';
}

async function post(title: string, body: string): Promise<void> {
  await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      ...(Platform.OS === 'android' ? { channelId: CHANNEL_ID } : {}),
    },
    trigger: null,
  });
}

/**
 * Post a local notification for a detected transaction. Failures are ignored —
 * a missing notification must never break balance tracking.
 */
export async function notifyTransaction(notice: TransactionNotice): Promise<void> {
  try {
    if (!(await canPost())) return;

    const isCredit = notice.direction === 'credit';
    const title = `${isCredit ? '↓ Received' : '↑ Sent'} Rs. ${formatPkr(notice.amount)}`;
    const lines = [
      `${notice.walletName} · ${formatTime(notice.at)}`,
      `Balance: Rs. ${formatPkr(notice.balanceAfter)}`,
    ];
    if (notice.aiProvider) lines.push(`Detected by ${notice.aiProvider} AI`);

    await post(title, lines.join('\n'));
  } catch (err) {
    console.error('[Notify] failed:', err);
  }
}

/**
 * Alert for everything one scan applied: individually when there are a few,
 * as a single summary when a catch-up turned up many.
 */
export async function notifyTransactions(notices: TransactionNotice[]): Promise<void> {
  if (notices.length === 0) return;
  if (notices.length <= MAX_INDIVIDUAL_ALERTS) {
    for (const notice of notices) await notifyTransaction(notice);
    return;
  }
  try {
    if (!(await canPost())) return;
    const lines = notices.map(
      (n) =>
        `${n.walletName}: ${n.direction === 'credit' ? '+' : '−'}Rs. ${formatPkr(n.amount)} → Rs. ${formatPkr(n.balanceAfter)}`
    );
    await post(`Flux updated ${notices.length} transactions`, lines.join('\n'));
  } catch (err) {
    console.error('[Notify] failed:', err);
  }
}
