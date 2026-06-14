import { useEffect } from 'react';
import { router } from 'expo-router';
import { View, ActivityIndicator } from 'react-native';
import { useWalletStore } from '../src/store/walletStore';
import { useTheme } from '../src/theme';

export default function IndexScreen() {
  const { theme } = useTheme();
  const hasCompletedOnboarding = useWalletStore((s) => s.hasCompletedOnboarding);

  useEffect(() => {
    // Small delay to let Zustand hydrate from AsyncStorage
    const timer = setTimeout(() => {
      if (hasCompletedOnboarding) {
        router.replace('/dashboard');
      } else {
        router.replace('/onboarding/welcome');
      }
    }, 100);
    return () => clearTimeout(timer);
  }, [hasCompletedOnboarding]);

  return (
    <View style={{ flex: 1, backgroundColor: theme.background, alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator color={theme.accentPrimary} size="large" />
    </View>
  );
}
