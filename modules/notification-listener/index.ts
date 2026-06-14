import { requireOptionalNativeModule } from 'expo-modules-core';
import type { EventSubscription } from 'expo-modules-core';

// Types for notification events emitted from native
export interface NotificationReceivedEvent {
  packageName: string;
  title: string;
  text: string;
  timestamp: number;
}

type NotificationEventsMap = {
  onNotificationReceived: (event: NotificationReceivedEvent) => void;
};

interface NotificationListenerNativeModule {
  checkPermission(): Promise<boolean>;
  openSettings(): void;
  startListening(): void;
  stopListening(): void;
  addListener<K extends keyof NotificationEventsMap>(
    eventName: K,
    listener: NotificationEventsMap[K]
  ): EventSubscription;
  removeListener<K extends keyof NotificationEventsMap>(
    eventName: K,
    listener: NotificationEventsMap[K]
  ): void;
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
 * Start listening for notifications (register the callback bridge).
 */
export function startListening(): void {
  if (!NotificationListenerModule) return;
  NotificationListenerModule.startListening();
}

/**
 * Stop listening for notifications.
 */
export function stopListening(): void {
  if (!NotificationListenerModule) return;
  NotificationListenerModule.stopListening();
}

/**
 * Subscribe to incoming notification events.
 * Returns an unsubscribe function.
 */
export function addNotificationListener(
  callback: (event: NotificationReceivedEvent) => void
): (() => void) | null {
  if (!NotificationListenerModule) return null;
  const subscription = NotificationListenerModule.addListener(
    'onNotificationReceived',
    callback
  );
  return () => subscription.remove();
}

/**
 * Whether the native module is available (Android only).
 */
export const isAvailable = NotificationListenerModule !== null;
