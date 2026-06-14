import { Platform, Linking, Alert } from 'react-native';

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
    Alert.alert(
      'Battery Optimization',
      'To keep Flux running in the background:\n\n' +
        '1. Open Settings → Apps → Flux\n' +
        '2. Tap Battery\n' +
        '3. Select "Unrestricted"\n\n' +
        'This ensures balance updates from SMS/notifications keep working.',
    );
  }
}

/**
 * Show a one-time prompt explaining why battery optimization matters.
 */
export function showBatteryOptimizationPrompt(): void {
  if (Platform.OS !== 'android') return;

  Alert.alert(
    'Keep Flux Active',
    'For reliable balance updates from SMS and notifications, we recommend disabling battery optimization for Flux.\n\n' +
      'This prevents Android from stopping Flux in the background.',
    [
      { text: 'Later', style: 'cancel' },
      {
        text: 'Open Settings',
        onPress: requestBatteryOptimizationExclusion,
      },
    ],
  );
}
