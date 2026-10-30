import { Linking } from 'react-native';
import {
  checkSmsPermission,
  requestSmsPermission,
  isAvailable as smsAvailable,
} from '../../modules/sms-listener';
import {
  checkNotificationPermission,
  openNotificationSettings,
  isAvailable as notificationsAvailable,
} from '../../modules/notification-listener';
import { showAppModal } from '../components/AppModal';
import { useWalletStore } from '../store/walletStore';
import { startLiveWatch } from './liveWatch';
import { runCatchUpScan } from './scanner';

export interface TrackingAccess {
  /** Some wallet tracks SMS but READ_SMS isn't granted. */
  smsMissing: boolean;
  /** Some wallet tracks notifications but notification access is off. */
  notificationsMissing: boolean;
}

/** Which of the access the user's wallets depend on is missing right now. */
export async function checkTrackingAccess(): Promise<TrackingAccess> {
  const wallets = useWalletStore.getState().wallets;
  const needsSms = smsAvailable && wallets.some((w) => w.trackingMethod === 'sms');
  const needsNotifications =
    notificationsAvailable && wallets.some((w) => w.trackingMethod === 'notification');
  const [sms, notifications] = await Promise.all([
    needsSms ? checkSmsPermission() : Promise.resolve(true),
    needsNotifications ? checkNotificationPermission() : Promise.resolve(true),
  ]);
  return { smsMissing: !sms, notificationsMissing: !notifications };
}

/**
 * Ask for SMS access. When Android won't show the prompt any more, explain
 * how to grant it from the app's settings page instead of failing silently.
 * Starts reading straight away once granted.
 */
export async function requestSmsAccess(): Promise<boolean> {
  const result = await requestSmsPermission();
  if (result === 'granted') {
    startLiveWatch();
    void runCatchUpScan('manual');
    return true;
  }
  if (result === 'blocked') {
    showAppModal({
      title: 'Allow SMS in Settings',
      message:
        'Android is no longer showing the permission prompt for Flux.\n\n' +
        'Open Settings → Permissions → SMS and choose "Allow".\n\n' +
        'If SMS is greyed out as a restricted setting, first tap ⋮ (top right) on the App info ' +
        'page and choose "Allow restricted settings".',
      buttons: [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Open Settings', style: 'default', onPress: () => void Linking.openSettings() },
      ],
    });
  }
  return false;
}

/**
 * Notification access has no runtime prompt; it is a toggle in system
 * settings, so explain and send the user there.
 */
export function requestNotificationAccess(): void {
  showAppModal({
    title: 'Enable Notification Access',
    message:
      'Android requires you to turn this on manually.\n\n' +
      'Tap "Open Settings", find Flux in the list and switch it on.\n\n' +
      'If Android says it is a restricted setting, open Flux\'s App info page, tap ⋮ (top right), ' +
      'choose "Allow restricted settings", then try again.',
    buttons: [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Open Settings', style: 'default', onPress: () => openNotificationSettings() },
    ],
  });
}
