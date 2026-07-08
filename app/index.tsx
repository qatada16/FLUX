import { useEffect } from 'react';
import { router } from 'expo-router';
import { View, ActivityIndicator } from 'react-native';
import { useWalletStore } from '../src/store/walletStore';
import { useAuthStore } from '../src/store/authStore';
import { useTheme } from '../src/theme';
import { pullWalletsFromCloud } from '../src/lib/sync';

export default function IndexScreen() {
  const { theme } = useTheme();
  const hasCompletedOnboarding = useWalletStore((s) => s.hasCompletedOnboarding);
  const initialize = useAuthStore((s) => s.initialize);

  useEffect(() => {
    const boot = async () => {
      // Initialize auth (checks for existing session)
      await initialize();
      const user = useAuthStore.getState().user;

      if (user) {
        // Logged in — try to pull fresh data from cloud, but never let a slow
        // or dead network hold the app hostage at boot: local data is already
        // usable, and the dashboard can sync later (pull-to-refresh /
        // foreground flush). 4s cap keeps cold starts snappy offline.
        await Promise.race([
          pullWalletsFromCloud(user.id),
          new Promise((resolve) => setTimeout(resolve, 4000)),
        ]);
        const hasWallets = useWalletStore.getState().hasCompletedOnboarding;
        if (hasWallets) {
          router.replace('/dashboard');
        } else {
          router.replace('/onboarding/welcome');
        }
      } else if (hasCompletedOnboarding) {
        // Not logged in but has local data — go to dashboard
        router.replace('/dashboard');
      } else {
        // Fresh install — show auth (with skip option)
        router.replace('/auth/login');
      }
    };

    // Small delay for Zustand hydration
    const timer = setTimeout(boot, 150);
    return () => clearTimeout(timer);
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: theme.background, alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator color={theme.accentPrimary} size="large" />
    </View>
  );
}
