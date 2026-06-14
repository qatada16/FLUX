import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useTheme } from '../../src/theme';

export default function WelcomeScreen() {
  const { theme } = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Hero area */}
      <View style={styles.heroArea}>
        <LinearGradient
          colors={[theme.accentPrimary, theme.accentSecondary]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.iconCircle}
        >
          <Text style={styles.iconText}>F</Text>
        </LinearGradient>

        <Text style={[styles.title, { color: theme.textPrimary }]}>
          Welcome to Flux
        </Text>
        <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
          See all your money in one place.{'\n'}
          Wallets, banks, everything — unified.
        </Text>
      </View>

      {/* Features list */}
      <View style={styles.features}>
        {[
          { emoji: '📊', text: 'Track balances across JazzCash, Easypaisa, SadaPay, banks & more' },
          { emoji: '📱', text: 'Auto-update from SMS or app notifications' },
          { emoji: '☁️', text: 'Cloud backup — never lose your data' },
        ].map((item, i) => (
          <View key={i} style={[styles.featureRow, { borderColor: theme.border }]}>
            <Text style={styles.featureEmoji}>{item.emoji}</Text>
            <Text style={[styles.featureText, { color: theme.textSecondary }]}>
              {item.text}
            </Text>
          </View>
        ))}
      </View>

      {/* CTA */}
      <View style={styles.ctaArea}>
        <Pressable
          onPress={() => router.push('/onboarding/select-wallets')}
          style={({ pressed }) => [
            styles.ctaButton,
            { backgroundColor: theme.accentPrimary, opacity: pressed ? 0.85 : 1 },
          ]}
        >
          <Text style={styles.ctaText}>Get Started</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 80,
  },
  heroArea: {
    alignItems: 'center',
    marginBottom: 40,
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  iconText: {
    fontFamily: 'Sora_700Bold',
    fontSize: 36,
    color: '#0B0E14',
  },
  title: {
    fontFamily: 'Sora_700Bold',
    fontSize: 30,
    textAlign: 'center',
    marginBottom: 12,
  },
  subtitle: {
    fontFamily: 'Sora_400Regular',
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
  },
  features: {
    gap: 12,
    marginBottom: 40,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderRadius: 14,
    gap: 14,
  },
  featureEmoji: {
    fontSize: 22,
  },
  featureText: {
    fontFamily: 'Sora_400Regular',
    fontSize: 14,
    flex: 1,
    lineHeight: 20,
  },
  ctaArea: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingBottom: 40,
  },
  ctaButton: {
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  ctaText: {
    fontFamily: 'Sora_600SemiBold',
    fontSize: 16,
    color: '#0B0E14',
  },
});
