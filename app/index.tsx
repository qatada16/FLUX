import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../src/theme';

export default function HomeScreen() {
  const { theme } = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Hero gradient card */}
      <LinearGradient
        colors={[theme.accentPrimary, theme.accentSecondary]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.heroCard}
      >
        <Text style={styles.heroLabel}>FLUX</Text>
        <Text style={styles.heroTitle}>Your Money, One View</Text>
        <Text style={styles.heroSubtitle}>
          Track all your wallets and bank accounts in one place
        </Text>
      </LinearGradient>

      {/* Status info */}
      <View style={[styles.statusCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <Text style={[styles.statusTitle, { color: theme.textPrimary }]}>
          Phase 0 — Setup Complete
        </Text>
        <Text style={[styles.statusText, { color: theme.textSecondary }]}>
          ✓ Expo + TypeScript{'\n'}
          ✓ expo-router (file-based navigation){'\n'}
          ✓ Dark theme system{'\n'}
          ✓ Sora font loaded{'\n'}
          ✓ Zustand store with AsyncStorage{'\n'}
          ✓ Provider templates configured
        </Text>
      </View>

      <Text style={[styles.footer, { color: theme.textSecondary }]}>
        Say "continue" to start Phase 1 — Onboarding UI
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 60,
    paddingHorizontal: 20,
  },
  heroCard: {
    borderRadius: 20,
    padding: 28,
    marginBottom: 24,
  },
  heroLabel: {
    fontFamily: 'Sora_700Bold',
    fontSize: 14,
    color: '#0B0E14',
    letterSpacing: 3,
    marginBottom: 8,
  },
  heroTitle: {
    fontFamily: 'Sora_700Bold',
    fontSize: 28,
    color: '#0B0E14',
    marginBottom: 8,
  },
  heroSubtitle: {
    fontFamily: 'Sora_400Regular',
    fontSize: 14,
    color: '#0B0E14',
    opacity: 0.7,
  },
  statusCard: {
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    marginBottom: 24,
  },
  statusTitle: {
    fontFamily: 'Sora_600SemiBold',
    fontSize: 18,
    marginBottom: 12,
  },
  statusText: {
    fontFamily: 'Sora_400Regular',
    fontSize: 14,
    lineHeight: 24,
  },
  footer: {
    fontFamily: 'Sora_400Regular',
    fontSize: 13,
    textAlign: 'center',
  },
});
