import { requireOptionalNativeModule } from 'expo-modules-core';

// A message read back from the device SMS inbox during a catch-up scan.
export interface SmsInboxMessage {
  id: string; // stable inbox row id — used for idempotent dedup
  sender: string;
  body: string;
  date: number; // epoch ms (received time)
}

interface SmsListenerNativeModule {
  checkPermission(): Promise<boolean>;
  requestPermission(): Promise<boolean>;
  readMessages(since: number, limit: number): Promise<SmsInboxMessage[]>;
}

// The native module — only available on Android.
const SmsListenerModule = requireOptionalNativeModule<SmsListenerNativeModule>('SmsListener');

/** Whether READ_SMS is granted. */
export async function checkSmsPermission(): Promise<boolean> {
  if (!SmsListenerModule) return false;
  return await SmsListenerModule.checkPermission();
}

/**
 * Request READ_SMS. The grant result arrives asynchronously, so this returns
 * false when a prompt was raised — re-check with checkSmsPermission().
 */
export async function requestSmsPermission(): Promise<boolean> {
  if (!SmsListenerModule) return false;
  return await SmsListenerModule.requestPermission();
}

/**
 * One page of inbox messages received at or after `since` (epoch ms), oldest
 * first. The scanner advances `since` past the last row it saw to page through
 * a wide window.
 */
export async function readMessages(since: number, limit: number): Promise<SmsInboxMessage[]> {
  if (!SmsListenerModule) return [];
  return await SmsListenerModule.readMessages(since, limit);
}

/** Whether the native module is available (Android only). */
export const isAvailable = SmsListenerModule !== null;
