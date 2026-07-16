import React, { useCallback, useEffect } from 'react';
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
import { initSmsListener, reconcileSms } from '../src/lib/smsHandler';
import { initNotificationListener } from '../src/lib/notificationHandler';
import { checkSmsPermission } from '../modules/sms-listener';
import { checkNotificationPermission } from '../modules/notification-listener';

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

  // Initialize native listeners if permissions are already granted
  useEffect(() => {
    if (Platform.OS === 'android') {
      checkSmsPermission().then((granted) => {
        if (granted) initSmsListener();
      });
      checkNotificationPermission().then((granted) => {
        if (granted) initNotificationListener();
      });
    }
  }, []);

  // Every time the app comes to the foreground:
  //  1. Reconcile the SMS inbox — recovers transaction SMS that arrived while
  //     the app was backgrounded/killed or the device was offline (the live
  //     listener may have missed them, but they're in the system inbox).
  //  2. Flush pending cloud sync — pushes balance changes and wallet deletions
  //     that happened while offline, now that we may have connectivity again.
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void reconcileSms();
        const user = useAuthStore.getState().user;
        if (user) void flushPendingSync(user.id);
      }
    });
    return () => sub.remove();
  }, []);

  const onLayoutRootView = useCallback(async () => {
    if (fontsLoaded) {
      await SplashScreen.hideAsync();
    }
  }, [fontsLoaded]);

  if (!fontsLoaded) return null;

  return (
    <ThemeContext.Provider value={{ theme, mode: themeMode }}>
      <View style={{ flex: 1, backgroundColor: theme.background }} onLayout={onLayoutRootView}>
        <StatusBar style={themeMode === 'dark' ? 'light' : 'dark'} />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: theme.background },
            animation: 'slide_from_right',
          }}
        />
        <AppModalHost />
      </View>
    </ThemeContext.Provider>
  );
}
