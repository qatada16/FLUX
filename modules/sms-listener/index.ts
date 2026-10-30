import { PermissionsAndroid, Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo-modules-core';
import type { EventSubscription } from 'expo-modules-core';

// A message read back from the device SMS inbox during a catch-up scan.
export interface SmsInboxMessage {
  id: string; // inbox row id
  sender: string;
  body: string;
  date: number; // epoch ms (received time)
}

type SmsEventsMap = {
  onInboxChanged: () => void;
};

interface SmsListenerNativeModule {
  checkPermission(): Promise<boolean>;
  readMessages(since: number, afterId: number, limit: number): Promise<SmsInboxMessage[]>;
  startWatching(): boolean;
  stopWatching(): void;
  addListener<K extends keyof SmsEventsMap>(eventName: K, listener: SmsEventsMap[K]): EventSubscription;
}

// The native module — only available on Android.
const SmsListenerModule = requireOptionalNativeModule<SmsListenerNativeModule>('SmsListener');

/** Whether READ_SMS is granted. */
export async function checkSmsPermission(): Promise<boolean> {
  if (!SmsListenerModule) return false;
  return await SmsListenerModule.checkPermission();
}

/**
 * 'blocked' means Android will no longer show the prompt (the user chose
 * "Don't allow" twice, or the permission is a restricted setting for a
 * sideloaded app) — the only way forward is the app's system settings page.
 */
export type SmsPermissionResult = 'granted' | 'denied' | 'blocked' | 'unavailable';

/**
 * Ask for READ_SMS and wait for the user's answer.
 */
export async function requestSmsPermission(): Promise<SmsPermissionResult> {
  if (!SmsListenerModule || Platform.OS !== 'android') return 'unavailable';
  if (await SmsListenerModule.checkPermission()) return 'granted';
  try {
    const result = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.READ_SMS, {
      title: 'Allow Flux to read transaction SMS',
      message:
        'Flux reads messages from the sender IDs you set up for each wallet to keep balances current. ' +
        'Other messages are ignored and nothing leaves your phone.',
      buttonPositive: 'Allow',
      buttonNegative: 'Not now',
    });
    if (result === PermissionsAndroid.RESULTS.GRANTED) return 'granted';
    if (result === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN) return 'blocked';
    return 'denied';
  } catch {
    return 'denied';
  }
}

/**
 * One page of inbox messages, oldest first, positioned after (since, afterId).
 * Start with afterId = -1 to read from `since` inclusive; continue from the
 * last row's (date, id) to get the next page.
 */
export async function readMessages(
  since: number,
  afterId: number,
  limit: number
): Promise<SmsInboxMessage[]> {
  if (!SmsListenerModule) return [];
  return await SmsListenerModule.readMessages(since, afterId, limit);
}

/**
 * Call `callback` whenever the SMS store changes, for as long as the app
 * process is alive. Returns an unsubscribe function, or null when the watch
 * couldn't start (no module, or READ_SMS not granted yet).
 */
export function watchInbox(callback: () => void): (() => void) | null {
  if (!SmsListenerModule) return null;
  if (!SmsListenerModule.startWatching()) return null;
  const subscription = SmsListenerModule.addListener('onInboxChanged', callback);
  return () => {
    subscription.remove();
    SmsListenerModule.stopWatching();
  };
}

/** Whether the native module is available (Android only). */
export const isAvailable = SmsListenerModule !== null;
