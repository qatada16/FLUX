import { requireOptionalNativeModule } from 'expo-modules-core';
import type { EventSubscription } from 'expo-modules-core';

// A notification captured by the listener service and parked natively until
// the next catch-up scan drains it.
export interface PendingNotification {
  id: string; // content-derived, so the same notification never queues twice
  packageName: string;
  title: string;
  text: string;
  timestamp: number;
}

type NotificationEventsMap = {
  onNotificationCaptured: () => void;
};

interface NotificationListenerNativeModule {
  checkPermission(): Promise<boolean>;
  openSettings(): void;
  setWatchedPackages(packages: string[]): void;
  getPending(): Promise<PendingNotification[]>;
  ack(ids: string[]): Promise<boolean>;
  clearPending(): Promise<boolean>;
  addListener<K extends keyof NotificationEventsMap>(
    eventName: K,
    listener: NotificationEventsMap[K]
  ): EventSubscription;
}

// The native module — only available on Android
const NotificationListenerModule =
  requireOptionalNativeModule<NotificationListenerNativeModule>('NotificationListener');

/**
 * Check if notification listener access is granted.
 */
export async function checkNotificationPermission(): Promise<boolean> {
  if (!NotificationListenerModule) return false;
  return await NotificationListenerModule.checkPermission();
}

/**
 * Open the Android Notification Access settings screen.
 * The user must manually toggle access for this app — there's no popup.
 */
export function openNotificationSettings(): void {
  if (!NotificationListenerModule) return;
  NotificationListenerModule.openSettings();
}

/**
 * Tell the listener service which app packages to capture. Everything else is
 * discarded on arrival, so this must be called whenever wallets change.
 */
export function setWatchedPackages(packages: string[]): void {
  if (!NotificationListenerModule) return;
  NotificationListenerModule.setWatchedPackages(packages);
}

/**
 * Notifications captured since the last ack, oldest first.
 */
export async function getPendingNotifications(): Promise<PendingNotification[]> {
  if (!NotificationListenerModule) return [];
  return await NotificationListenerModule.getPending();
}

/**
 * Drop captured notifications once they have been applied. Separate from the
 * read so an interrupted scan leaves the queue for the next attempt.
 */
export async function ackNotifications(ids: string[]): Promise<void> {
  if (!NotificationListenerModule || ids.length === 0) return;
  await NotificationListenerModule.ack(ids);
}

/**
 * Discard everything queued — used when resetting, so a fresh baseline
 * doesn't replay old alerts against a newly set balance.
 */
export async function clearPendingNotifications(): Promise<void> {
  if (!NotificationListenerModule) return;
  await NotificationListenerModule.clearPending();
}

/**
 * Call `callback` when the listener service queues a tracked notification
 * while the app is running. Returns an unsubscribe function.
 */
export function onNotificationCaptured(callback: () => void): (() => void) | null {
  if (!NotificationListenerModule) return null;
  const subscription = NotificationListenerModule.addListener('onNotificationCaptured', callback);
  return () => subscription.remove();
}

/**
 * Whether the native module is available (Android only).
 */
export const isAvailable = NotificationListenerModule !== null;
