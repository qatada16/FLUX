import { Platform, Linking } from 'react-native';
import { showAppModal } from '../components/AppModal';
import { useSettingsStore, MAX_BATTERY_PROMPTS } from '../store/settingsStore';
import { checkSmsPermission } from '../../modules/sms-listener';
import { checkNotificationPermission } from '../../modules/notification-listener';

/**
 * Request battery optimization exclusion on Android.
 * This prevents the OS from killing Flux in the background,
 * which would stop SMS/notification listening.
 */
export async function requestBatteryOptimizationExclusion(): Promise<void> {
  if (Platform.OS !== 'android') return;

  try {
    // Deep-link to the battery optimization settings for this app
    await Linking.openSettings();
  } catch {
    // Fallback: just show instructions
    showAppModal({
      title: 'Battery Optimization',
      message:
        'To keep Flux running in the background:\n\n' +
        '1. Open Settings → Apps → Flux\n' +
        '2. Tap Battery\n' +
        '3. Select "Unrestricted"\n\n' +
        'This ensures balance updates from SMS/notifications keep working.',
    });
  }
}

/**
 * Show a prompt explaining why battery optimization matters. Gating (how
 * often / when) is handled by the caller — this just renders the prompt.
 */
export function showBatteryOptimizationPrompt(): void {
  if (Platform.OS !== 'android') return;

  showAppModal({
    title: 'Keep Flux Active',
    message:
      'For reliable balance updates from SMS and notifications, we recommend disabling battery optimization for Flux.\n\n' +
      'This prevents Android from stopping Flux in the background.',
    buttons: [
      { text: 'Later', style: 'cancel' },
      { text: 'Open Settings', style: 'default', onPress: requestBatteryOptimizationExclusion },
    ],
  });
}

/**
 * Show the battery prompt only when it's actually useful:
 *   - Android only.
 *   - Only while a needed permission (SMS or notification) is still missing —
 *     once the user has granted access there's no reason to keep nagging.
 *   - At most MAX_BATTERY_PROMPTS times ever (persisted counter), so it
 *     appears just for the first few opens after install, not on every launch.
 *
 * Call this on the dashboard after a short delay. It self-gates, so it's safe
 * to call on every mount.
 */
export async function maybeShowBatteryPrompt(): Promise<void> {
  if (Platform.OS !== 'android') return;

  const { batteryPromptCount, recordBatteryPromptShown } =
    useSettingsStore.getState();
  if (batteryPromptCount >= MAX_BATTERY_PROMPTS) return;

  // If both permissions are already granted, the app is set up — don't nag.
  const [smsGranted, notifGranted] = await Promise.all([
    checkSmsPermission(),
    checkNotificationPermission(),
  ]);
  if (smsGranted && notifGranted) return;

  recordBatteryPromptShown();
  showBatteryOptimizationPrompt();
}
