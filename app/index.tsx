import { useEffect } from 'react';
import { router } from 'expo-router';
import { View, ActivityIndicator } from 'react-native';
import { useWalletStore } from '../src/store/walletStore';
import { useAuthStore } from '../src/store/authStore';
import { useTheme } from '../src/theme';
import { pullWalletsFromCloud } from '../src/lib/sync';
import { pullAiKeys } from '../src/lib/aiKeysSync';
import { ensureStoresHydrated } from '../src/lib/hydrate';

export default function IndexScreen() {
  const { theme } = useTheme();
  const initialize = useAuthStore((s) => s.initialize);

  useEffect(() => {
    let cancelled = false;
    const boot = async () => {
      // Routing depends on persisted state (has this device onboarded?), so
      // wait for it to load — a fixed delay sent returning users to sign-in
      // whenever storage was slow.
      await ensureStoresHydrated();
      // Initialize auth (checks for existing session)
      await initialize();
      if (cancelled) return;
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
        void pullAiKeys(user.id);
        const hasWallets = useWalletStore.getState().hasCompletedOnboarding;
        if (hasWallets) {
          router.replace('/dashboard');
        } else {
          router.replace('/onboarding/welcome');
        }
      } else if (useWalletStore.getState().hasCompletedOnboarding) {
        // Not logged in but has local data — go to dashboard
        router.replace('/dashboard');
      } else {
        // Fresh install — show auth (with skip option)
        router.replace('/auth/login');
      }
    };

    void boot();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: theme.background, alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator color={theme.accentPrimary} size="large" />
    </View>
  );
}
