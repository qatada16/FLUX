import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, Switch, Platform } from 'react-native';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../src/theme';
import { showAppModal } from '../src/components/AppModal';
import { useSettingsStore } from '../src/store/settingsStore';
import { useWalletStore } from '../src/store/walletStore';
import { useTransactionStore } from '../src/store/transactionStore';
import { useAuthStore } from '../src/store/authStore';
import { pushAllWalletsToCloud } from '../src/lib/sync';
import { checkSmsPermission, requestSmsPermission, isAvailable as smsAvailable } from '../modules/sms-listener';
import { checkNotificationPermission, openNotificationSettings, isAvailable as notifAvailable } from '../modules/notification-listener';
import { initSmsListener } from '../src/lib/smsHandler';
import { initNotificationListener } from '../src/lib/notificationHandler';
import { requestBatteryOptimizationExclusion } from '../src/lib/battery';

export default function SettingsScreen() {
  const { theme } = useTheme();
  const [smsGranted, setSmsGranted] = useState(false);
  const [notifGranted, setNotifGranted] = useState(false);

  // Check permissions on mount and when returning from settings
  const checkPermissions = () => {
    if (Platform.OS === 'android') {
      if (smsAvailable) checkSmsPermission().then(setSmsGranted);
      if (notifAvailable) checkNotificationPermission().then(setNotifGranted);
    }
  };

  useEffect(() => {
    checkPermissions();
  }, []);
  const themeMode = useSettingsStore((s) => s.themeMode);
  const toggleTheme = useSettingsStore((s) => s.toggleTheme);
  const resetOnboarding = useWalletStore((s) => s.resetOnboarding);
  const clearTransactions = useTransactionStore((s) => s.clear);
  const wallets = useWalletStore((s) => s.wallets);
  const user = useAuthStore((s) => s.user);
  const signOut = useAuthStore((s) => s.signOut);

  const handleSync = async () => {
    if (!user) {
      router.push('/auth/login');
      return;
    }
    const ok = await pushAllWalletsToCloud(user.id);
    if (ok) {
      showAppModal({ title: 'Synced!', message: 'All wallets backed up to cloud.' });
    } else {
      showAppModal({ title: 'Sync failed', message: 'Could not sync to cloud. Check your connection.' });
    }
  };

  const handleSignOut = async () => {
    await signOut();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    showAppModal({ title: 'Signed out', message: 'You are now using Flux offline.' });
  };

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

      {/* Account section */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>ACCOUNT</Text>
        {user ? (
          <>
            <View style={[styles.row, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowLabel, { color: theme.textPrimary }]}>Signed in as</Text>
                <Text style={[styles.rowHint, { color: theme.accentPrimary }]}>{user.email}</Text>
              </View>
              <View style={[styles.statusDot, { backgroundColor: theme.success }]} />
            </View>
            <Pressable
              onPress={handleSync}
              style={[styles.row, { backgroundColor: theme.surface, borderColor: theme.border }]}
            >
              <Text style={[styles.rowLabel, { color: theme.textPrimary }]}>Sync Now</Text>
              <Text style={[styles.rowArrow, { color: theme.textSecondary }]}>↑</Text>
            </Pressable>
            <Pressable
              onPress={handleSignOut}
              style={[styles.row, { backgroundColor: theme.surface, borderColor: theme.border }]}
            >
              <Text style={[styles.rowLabel, { color: theme.danger }]}>Sign Out</Text>
            </Pressable>
          </>
        ) : (
          <Pressable
            onPress={() => router.push('/auth/login')}
            style={[styles.row, { backgroundColor: theme.accentPrimary + '15', borderColor: theme.accentPrimary + '40' }]}
          >
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowLabel, { color: theme.accentPrimary }]}>Sign In</Text>
              <Text style={[styles.rowHint, { color: theme.textSecondary }]}>
                Back up your wallets to the cloud
              </Text>
            </View>
            <Text style={[styles.rowArrow, { color: theme.accentPrimary }]}>→</Text>
          </Pressable>
        )}
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
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.push('/transactions');
          }}
          style={[styles.row, { backgroundColor: theme.surface, borderColor: theme.border }]}
        >
          <Text style={[styles.rowLabel, { color: theme.textPrimary }]}>Transaction History</Text>
          <Text style={[styles.rowArrow, { color: theme.textSecondary }]}>→</Text>
        </Pressable>
      </View>

      {/* Permissions section (placeholder for Phase 5-6) */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>PERMISSIONS</Text>
        <Pressable
          onPress={async () => {
            if (!smsAvailable) {
              showAppModal({ title: 'Not available', message: 'SMS listening is only available on Android.' });
              return;
            }
            if (smsGranted) {
              showAppModal({ title: 'Already granted', message: 'SMS permission is already enabled.' });
              return;
            }
            await requestSmsPermission();
            // Re-check after a short delay (permission dialog is async)
            setTimeout(async () => {
              const granted = await checkSmsPermission();
              setSmsGranted(granted);
              if (granted) {
                initSmsListener();
                showAppModal({ title: 'SMS Access Granted', message: 'Flux will now read incoming SMS to update balances.' });
              }
            }, 1000);
          }}
          style={[styles.row, { backgroundColor: theme.surface, borderColor: theme.border }]}
        >
          <View style={{ flex: 1 }}>
            <Text style={[styles.rowLabel, { color: theme.textPrimary }]}>SMS Access</Text>
            <Text style={[styles.rowHint, { color: theme.textSecondary }]}>
              {smsGranted ? 'Granted — listening for SMS' : 'Tap to request permission'}
            </Text>
          </View>
          <View style={[styles.statusDot, { backgroundColor: smsGranted ? theme.success : theme.warning }]} />
        </Pressable>
        <Pressable
          onPress={() => {
            if (!notifAvailable) {
              showAppModal({ title: 'Not available', message: 'Notification listening is only available on Android.' });
              return;
            }
            if (notifGranted) {
              showAppModal({ title: 'Already granted', message: 'Notification access is already enabled.' });
              return;
            }
            showAppModal({
              title: 'Enable Notification Access',
              message:
                'Android requires you to manually enable notification access.\n\nTap "Open Settings", then find "Flux" in the list and toggle it ON.',
              buttons: [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Open Settings',
                  style: 'default',
                  onPress: () => {
                    openNotificationSettings();
                    // Re-check when user comes back (they'll tap back)
                    setTimeout(() => {
                      checkNotificationPermission().then((granted) => {
                        setNotifGranted(granted);
                        if (granted) {
                          initNotificationListener();
                        }
                      });
                    }, 3000);
                  },
                },
              ],
            });
          }}
          style={[styles.row, { backgroundColor: theme.surface, borderColor: theme.border }]}
        >
          <View style={{ flex: 1 }}>
            <Text style={[styles.rowLabel, { color: theme.textPrimary }]}>Notification Access</Text>
            <Text style={[styles.rowHint, { color: theme.textSecondary }]}>
              {notifGranted
                ? 'Granted — listening for notifications'
                : 'Tap to open settings (manual toggle required)'}
            </Text>
          </View>
          <View style={[styles.statusDot, { backgroundColor: notifGranted ? theme.success : theme.warning }]} />
        </Pressable>
        {Platform.OS === 'android' && (
          <Pressable
            onPress={requestBatteryOptimizationExclusion}
            style={[styles.row, { backgroundColor: theme.surface, borderColor: theme.border }]}
          >
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowLabel, { color: theme.textPrimary }]}>Battery Optimization</Text>
              <Text style={[styles.rowHint, { color: theme.textSecondary }]}>
                Tap to exclude Flux from battery restrictions
              </Text>
            </View>
            <Text style={[styles.rowArrow, { color: theme.textSecondary }]}>→</Text>
          </Pressable>
        )}
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
            showAppModal({
              title: 'Reset All Data',
              message: 'This will remove all wallets and settings. Are you sure?',
              buttons: [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Reset',
                  style: 'destructive',
                  onPress: () => {
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
                    resetOnboarding();
                    clearTransactions();
                    router.replace('/');
                  },
                },
              ],
            });
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
