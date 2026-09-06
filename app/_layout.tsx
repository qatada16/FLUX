import React, { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AppState, Platform, View } from 'react-native';
import { useFonts, Sora_400Regular, Sora_500Medium, Sora_600SemiBold, Sora_700Bold } from '@expo-google-fonts/sora';
import * as SplashScreen from 'expo-splash-screen';
import { ThemeContext, darkTheme, lightTheme } from '../src/theme';
import { AppModalHost } from '../src/components/AppModal';
import { useSettingsStore } from '../src/store/settingsStore';
import { useAuthStore } from '../src/store/authStore';
import { flushPendingSync } from '../src/lib/sync';
import { initNotifications } from '../src/lib/notify';
import { runCatchUpScan, syncWatchedPackages } from '../src/lib/scanner';
import { registerDailyScan } from '../src/lib/backgroundScan';
import { useWalletStore } from '../src/store/walletStore';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const themeMode = useSettingsStore((s) => s.themeMode);
  const theme = themeMode === 'dark' ? darkTheme : lightTheme;

  const [fontsLoaded] = useFonts({
    Sora_400Regular,
    Sora_500Medium,
    Sora_600SemiBold,
    Sora_700Bold,
  });

  // Nothing listens in the background any more. On launch we register the
  // once-a-day scan with Android and catch up on whatever arrived while the
  // app was closed.
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    void initNotifications();
    void registerDailyScan();
    void runCatchUpScan('launch');
  }, []);

  // Keep the notification listener's package filter in step with the wallets,
  // so the service captures exactly what is being tracked and nothing else.
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    syncWatchedPackages();
    return useWalletStore.subscribe(syncWatchedPackages);
  }, []);

  // Coming back to the foreground is the main catch-up point: scan the inbox
  // and the captured notifications, then flush anything queued for the cloud.
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void runCatchUpScan('foreground');
        const user = useAuthStore.getState().user;
        if (user) void flushPendingSync(user.id);
      }
    });
    return () => sub.remove();
  }, []);

  // Keep the splash up until fonts are ready, then hand over to a themed root
  // view — never render nothing, or the bare window background shows through.
  useEffect(() => {
    if (fontsLoaded) SplashScreen.hideAsync().catch(() => {});
  }, [fontsLoaded]);

  return (
    <ThemeContext.Provider value={{ theme, mode: themeMode }}>
      <View style={{ flex: 1, backgroundColor: theme.background }}>
        <StatusBar style={themeMode === 'dark' ? 'light' : 'dark'} />
        {fontsLoaded && (
          <>
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: theme.background },
                animation: 'slide_from_right',
              }}
            />
            <AppModalHost />
          </>
        )}
      </View>
    </ThemeContext.Provider>
  );
}
