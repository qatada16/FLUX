import React from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, Switch } from 'react-native';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../src/theme';
import { useSettingsStore } from '../src/store/settingsStore';
import { useWalletStore } from '../src/store/walletStore';

export default function SettingsScreen() {
  const { theme } = useTheme();
  const themeMode = useSettingsStore((s) => s.themeMode);
  const toggleTheme = useSettingsStore((s) => s.toggleTheme);
  const resetOnboarding = useWalletStore((s) => s.resetOnboarding);
  const wallets = useWalletStore((s) => s.wallets);

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.background }]}
      contentContainerStyle={styles.content}
    >
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()}>
          <Text style={[styles.backButton, { color: theme.accentTertiary }]}>← Back</Text>
        </Pressable>
        <Text style={[styles.title, { color: theme.textPrimary }]}>Settings</Text>
        <View style={{ width: 50 }} />
      </View>

      {/* Wallets section */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>WALLETS</Text>
        <Pressable
          onPress={() => router.push('/onboarding/select-wallets')}
          style={[styles.row, { backgroundColor: theme.surface, borderColor: theme.border }]}
        >
          <Text style={[styles.rowLabel, { color: theme.textPrimary }]}>Add New Wallet</Text>
          <Text style={[styles.rowArrow, { color: theme.textSecondary }]}>→</Text>
        </Pressable>
        <View style={[styles.row, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Text style={[styles.rowLabel, { color: theme.textPrimary }]}>Active Wallets</Text>
          <Text style={[styles.rowValue, { color: theme.textSecondary }]}>{wallets.length}</Text>
        </View>
      </View>

      {/* Permissions section (placeholder for Phase 5-6) */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>PERMISSIONS</Text>
        <View style={[styles.row, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.rowLabel, { color: theme.textPrimary }]}>SMS Access</Text>
            <Text style={[styles.rowHint, { color: theme.textSecondary }]}>Coming in Phase 5</Text>
          </View>
          <View style={[styles.statusDot, { backgroundColor: theme.warning }]} />
        </View>
        <View style={[styles.row, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.rowLabel, { color: theme.textPrimary }]}>Notification Access</Text>
            <Text style={[styles.rowHint, { color: theme.textSecondary }]}>Coming in Phase 6</Text>
          </View>
          <View style={[styles.statusDot, { backgroundColor: theme.warning }]} />
        </View>
      </View>

      {/* Account section (placeholder for Phase 4) */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>ACCOUNT</Text>
        <View style={[styles.row, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Text style={[styles.rowLabel, { color: theme.textPrimary }]}>Supabase Sync</Text>
          <Text style={[styles.rowValue, { color: theme.warning }]}>Phase 4</Text>
        </View>
      </View>

      {/* Appearance */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>APPEARANCE</Text>
        <View style={[styles.row, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Text style={[styles.rowLabel, { color: theme.textPrimary }]}>Dark Mode</Text>
          <Switch
            value={themeMode === 'dark'}
            onValueChange={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              toggleTheme();
            }}
            trackColor={{ false: theme.border, true: theme.accentPrimary + '80' }}
            thumbColor={themeMode === 'dark' ? theme.accentPrimary : '#f4f3f4'}
          />
        </View>
      </View>

      {/* Danger zone */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: theme.danger }]}>DANGER ZONE</Text>
        <Pressable
          onPress={() => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            resetOnboarding();
            router.replace('/');
          }}
          style={[styles.row, { backgroundColor: theme.danger + '12', borderColor: theme.danger + '30' }]}
        >
          <Text style={[styles.rowLabel, { color: theme.danger }]}>Reset All Data</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingTop: 56,
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 28,
  },
  backButton: {
    fontFamily: 'Sora_500Medium',
    fontSize: 15,
  },
  title: {
    fontFamily: 'Sora_700Bold',
    fontSize: 20,
  },
  section: {
    marginBottom: 28,
  },
  sectionTitle: {
    fontFamily: 'Sora_600SemiBold',
    fontSize: 12,
    letterSpacing: 1,
    marginBottom: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    marginBottom: 8,
  },
  rowLabel: {
    fontFamily: 'Sora_500Medium',
    fontSize: 15,
  },
  rowHint: {
    fontFamily: 'Sora_400Regular',
    fontSize: 12,
    marginTop: 2,
  },
  rowValue: {
    fontFamily: 'Sora_600SemiBold',
    fontSize: 14,
  },
  rowArrow: {
    fontFamily: 'Sora_600SemiBold',
    fontSize: 18,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
});
