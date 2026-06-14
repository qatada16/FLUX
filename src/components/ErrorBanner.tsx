import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useTheme } from '../theme';

interface ErrorBannerProps {
  message: string;
  onDismiss?: () => void;
}

export function ErrorBanner({ message, onDismiss }: ErrorBannerProps) {
  const { theme } = useTheme();

  return (
    <Animated.View
      entering={FadeIn.duration(300)}
      exiting={FadeOut.duration(200)}
      style={[styles.container, { backgroundColor: theme.danger + '18', borderColor: theme.danger + '40' }]}
    >
      <Text style={[styles.message, { color: theme.danger }]}>{message}</Text>
      {onDismiss && (
        <Pressable onPress={onDismiss}>
          <Text style={[styles.dismiss, { color: theme.danger }]}>✕</Text>
        </Pressable>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    marginBottom: 14,
    gap: 10,
  },
  message: {
    fontFamily: 'Sora_500Medium',
    fontSize: 13,
    flex: 1,
    lineHeight: 18,
  },
  dismiss: {
    fontSize: 16,
    fontWeight: 'bold',
    paddingLeft: 8,
  },
});
