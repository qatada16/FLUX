import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

const CHANNEL_ID = 'flux-transactions';
let initialized = false;

export interface TransactionNotice {
  walletName: string;
  amount: number;
  direction: 'credit' | 'debit';
  balanceAfter: number;
  /** Display name of the AI provider, when detection came from AI. */
  aiProvider?: string;
}

/**
 * Prepare the notification channel and permission. Safe to call repeatedly.
 */
export async function initNotifications(): Promise<void> {
  if (initialized) return;
  initialized = true;

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

    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') await Notifications.requestPermissionsAsync();
  } catch (err) {
    console.error('[Notify] init failed:', err);
  }
}

function formatPkr(value: number): string {
  return value.toLocaleString('en-PK', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Post a local notification for a detected transaction. Failures are ignored —
 * a missing notification must never break balance tracking.
 */
export async function notifyTransaction(notice: TransactionNotice): Promise<void> {
  try {
    await initNotifications();

    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') return;

    const isCredit = notice.direction === 'credit';
    const time = new Date().toLocaleTimeString('en-PK', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });

    const title = `${isCredit ? '↓ Received' : '↑ Sent'} Rs. ${formatPkr(notice.amount)}`;
    const lines = [
      `${notice.walletName} · ${time}`,
      `Balance: Rs. ${formatPkr(notice.balanceAfter)}`,
    ];
    if (notice.aiProvider) lines.push(`Detected by ${notice.aiProvider} AI`);

    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body: lines.join('\n'),
        ...(Platform.OS === 'android' ? { channelId: CHANNEL_ID } : {}),
      },
      trigger: null,
    });
  } catch (err) {
    console.error('[Notify] failed:', err);
  }
}
