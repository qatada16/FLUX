import { requireOptionalNativeModule } from 'expo-modules-core';
import type { EventEmitter, EventSubscription } from 'expo-modules-core';

// Types for SMS events emitted from native
export interface SmsReceivedEvent {
  sender: string;
  body: string;
  timestamp: number;
}

// A message read back from the device SMS inbox during reconciliation.
export interface SmsInboxMessage {
  id: string; // stable inbox row id — used for idempotent dedup
  sender: string;
  body: string;
  date: number; // epoch ms (received time)
}

type SmsEventsMap = {
  onSmsReceived: (event: SmsReceivedEvent) => void;
};

interface SmsListenerNativeModule {
  checkPermission(): Promise<boolean>;
  requestPermission(): Promise<boolean>;
  readMessagesSince(since: number): Promise<SmsInboxMessage[]>;
  startListening(): void;
  stopListening(): void;
  addListener<K extends keyof SmsEventsMap>(eventName: K, listener: SmsEventsMap[K]): EventSubscription;
  removeListener<K extends keyof SmsEventsMap>(eventName: K, listener: SmsEventsMap[K]): void;
}

// The native module — only available on Android.
// Since SDK 52, the module itself IS an EventEmitter.
const SmsListenerModule = requireOptionalNativeModule<SmsListenerNativeModule>('SmsListener');

/**
 * Check if SMS permissions are granted.
 */
export async function checkSmsPermission(): Promise<boolean> {
  if (!SmsListenerModule) return false;
  return await SmsListenerModule.checkPermission();
}

/**
 * Request SMS permissions (RECEIVE_SMS + READ_SMS).
 * Returns true if granted.
 */
export async function requestSmsPermission(): Promise<boolean> {
  if (!SmsListenerModule) return false;
  return await SmsListenerModule.requestPermission();
}

/**
 * Read SMS inbox messages received at or after `since` (epoch ms), oldest
 * first. Used by reconciliation to recover messages the live listener missed.
 * Returns an empty array if the module/permission is unavailable.
 */
export async function readMessagesSince(since: number): Promise<SmsInboxMessage[]> {
  if (!SmsListenerModule) return [];
  return await SmsListenerModule.readMessagesSince(since);
}

/**
 * Start listening for incoming SMS.
 */
export function startListening(): void {
  if (!SmsListenerModule) return;
  SmsListenerModule.startListening();
}

/**
 * Stop listening for incoming SMS.
 */
export function stopListening(): void {
  if (!SmsListenerModule) return;
  SmsListenerModule.stopListening();
}

/**
 * Subscribe to incoming SMS events.
 * Returns a subscription that can be removed.
 */
export function addSmsListener(callback: (event: SmsReceivedEvent) => void): (() => void) | null {
  if (!SmsListenerModule) return null;
  const subscription: EventSubscription = SmsListenerModule.addListener('onSmsReceived', callback);
  return () => subscription.remove();
}

/**
 * Whether the native module is available (Android only).
 */
export const isAvailable = SmsListenerModule !== null;
