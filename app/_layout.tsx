import React, { useCallback, useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Platform, View } from 'react-native';
import { useFonts, Sora_400Regular, Sora_500Medium, Sora_600SemiBold, Sora_700Bold } from '@expo-google-fonts/sora';
import * as SplashScreen from 'expo-splash-screen';
import { ThemeContext, darkTheme, lightTheme } from '../src/theme';
import { useSettingsStore } from '../src/store/settingsStore';
import { initSmsListener } from '../src/lib/smsHandler';
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
      </View>
    </ThemeContext.Provider>
  );
}
