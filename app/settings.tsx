import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, Switch, Platform, AppState, Linking } from 'react-native';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../src/theme';
import { showAppModal } from '../src/components/AppModal';
import { useSettingsStore } from '../src/store/settingsStore';
import { useWalletStore } from '../src/store/walletStore';
import { useTransactionStore } from '../src/store/transactionStore';
import { useAiKeysStore, AI_PROVIDERS } from '../src/store/aiKeysStore';
import { useAuthStore } from '../src/store/authStore';
import { pushAllWalletsToCloud } from '../src/lib/sync';
import { checkSmsPermission, isAvailable as smsAvailable } from '../modules/sms-listener';
import { checkNotificationPermission, isAvailable as notifAvailable } from '../modules/notification-listener';
import { runCatchUpScan, type ScanResult } from '../src/lib/scanner';
import { requestNotificationAccess, requestSmsAccess } from '../src/lib/permissions';
import { backgroundScanAvailable, BACKGROUND_INTERVAL_MINUTES } from '../src/lib/backgroundScan';
import { installedVersion } from '../src/lib/appUpdate';
import { checkForUpdatesNow } from '../src/components/UpdatePrompt';
import { REFRESH_WINDOW_OPTIONS, type RefreshWindowDays } from '../src/store/settingsStore';

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

function describeScan(result: ScanResult): string {
  const lines = [`Checked the last ${result.windowDays} days.`, ''];
  if (result.found === 0) {
    lines.push("No messages from your wallets' sender IDs or apps were found in this period.");
  } else {
    lines.push(`${plural(result.found, 'message')} from your wallets found:`);
    lines.push(`•  ${plural(result.applied, 'new transaction')} applied`);
    if (result.alreadyCounted > 0) lines.push(`•  ${result.alreadyCounted} already counted`);
    if (result.ignored > 0) lines.push(`•  ${result.ignored} not a transaction (OTP, promo…)`);
    if (result.queued > 0) lines.push(`•  ${result.queued} waiting for AI (offline)`);
    const perWallet = result.perWallet.filter((w) => w.found > 0);
    if (perWallet.length > 1) {
      lines.push('');
      for (const w of perWallet) {
        lines.push(`${w.walletName}: ${plural(w.found, 'message')}, ${w.applied} applied`);
      }
    }
  }
  if (result.smsPermissionMissing) {
    lines.push('', '⚠ SMS access is off, so SMS wallets were not checked. Enable it under Permissions.');
  }
  if (result.notificationAccessMissing) {
    lines.push('', '⚠ Notification access is off — new wallet-app alerts are not being captured.');
  }
  if (result.error) lines.push('', `Something went wrong: ${result.error}`);
  return lines.join('\n');
}

export default function SettingsScreen() {
  const { theme } = useTheme();
  const [smsGranted, setSmsGranted] = useState(false);
  const [notifGranted, setNotifGranted] = useState(false);
  const [backgroundOn, setBackgroundOn] = useState<boolean | null>(null);

  // Check on mount and whenever the user comes back from system settings —
  // that's where notification access (and a blocked SMS permission) is granted.
  const checkPermissions = useCallback(() => {
    if (Platform.OS !== 'android') return;
    if (smsAvailable) checkSmsPermission().then(setSmsGranted);
    if (notifAvailable) checkNotificationPermission().then(setNotifGranted);
    backgroundScanAvailable().then(setBackgroundOn);
  }, []);

  useEffect(() => {
    checkPermissions();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') checkPermissions();
    });
    return () => sub.remove();
  }, [checkPermissions]);
  const themeMode = useSettingsStore((s) => s.themeMode);
  const toggleTheme = useSettingsStore((s) => s.toggleTheme);
  const resetOnboarding = useWalletStore((s) => s.resetOnboarding);
  const clearTransactions = useTransactionStore((s) => s.clear);
  const aiKeys = useAiKeysStore((s) => s.keys);
  const clearAiKeys = useAiKeysStore((s) => s.clear);
  const aiKeyCount = AI_PROVIDERS.filter((p) => !!aiKeys[p]).length;
  const wallets = useWalletStore((s) => s.wallets);
  const user = useAuthStore((s) => s.user);
  const signOut = useAuthStore((s) => s.signOut);

  const refreshWindowDays = useSettingsStore((s) => s.refreshWindowDays);
  const setRefreshWindowDays = useSettingsStore((s) => s.setRefreshWindowDays);
  const lastScanAt = useSettingsStore((s) => s.lastScanAt);
  const [scanning, setScanning] = useState(false);
  const version = installedVersion();

  const lastScanLabel = (() => {
    if (!lastScanAt) return 'Not checked yet';
    const mins = Math.floor((Date.now() - lastScanAt) / 60000);
    if (mins < 1) return 'Checked just now';
    if (mins < 60) return `Checked ${mins} min ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `Checked ${hrs} hour${hrs === 1 ? '' : 's'} ago`;
    const days = Math.floor(hrs / 24);
    return `Checked ${days} day${days === 1 ? '' : 's'} ago`;
  })();

  const chooseRefreshWindow = () => {
    showAppModal({
      title: 'Catch-up Window',
      message:
        'How far back Flux reads your wallet SMS and captured notifications on every check.' +
        '\n\n' +
        'A message is never counted twice, and messages older than a balance you entered ' +
        'yourself are treated as already included — so a longer window only finds ' +
        'transactions that were genuinely missed.',
      buttons: [
        ...REFRESH_WINDOW_OPTIONS.map((days) => ({
          text: `${days === refreshWindowDays ? '✓  ' : ''}Last ${days} days`,
          style: 'default' as const,
          onPress: () => {
            setRefreshWindowDays(days as RefreshWindowDays);
            void Haptics.selectionAsync();
          },
        })),
        { text: 'Cancel', style: 'cancel' as const },
      ],
    });
  };

  const handleScanNow = async () => {
    if (scanning) return;
    setScanning(true);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const result = await runCatchUpScan('manual');
    setScanning(false);
    checkPermissions();

    if (result.skipped === 'unavailable') {
      showAppModal({ title: 'Not available', message: 'Automatic tracking needs an Android device.' });
      return;
    }
    if (result.skipped === 'no-wallets') {
      showAppModal({
        title: 'Nothing to check',
        message:
          'No wallet is set up for automatic tracking. Open a wallet, tap Edit, and choose SMS ' +
          '(with its sender IDs) or Notification.',
      });
      return;
    }
    if (result.skipped === 'no-permission') {
      showAppModal({
        title: 'SMS access needed',
        message: 'Flux needs SMS access to read your wallet messages.',
        buttons: [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Allow SMS',
            style: 'default',
            onPress: () => void requestSmsAccess().then(checkPermissions),
          },
        ],
      });
      return;
    }

    void Haptics.notificationAsync(
      result.applied > 0
        ? Haptics.NotificationFeedbackType.Success
        : Haptics.NotificationFeedbackType.Warning
    );
    showAppModal({
      title: result.applied > 0 ? 'Balances updated' : 'Already up to date',
      message: describeScan(result),
    });
  };

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
    // Drop cached AI keys so a different account can never reuse them.
    clearAiKeys();
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
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.push('/ai-keys');
          }}
          style={[styles.row, { backgroundColor: theme.surface, borderColor: theme.border }]}
        >
          <View style={{ flex: 1 }}>
            <Text style={[styles.rowLabel, { color: theme.textPrimary }]}>AI Detection Keys</Text>
            <Text style={[styles.rowHint, { color: theme.textSecondary }]}>
              {aiKeyCount > 0
                ? `${aiKeyCount} provider${aiKeyCount === 1 ? '' : 's'} configured`
                : 'Not configured — AI parsing off'}
            </Text>
          </View>
          <Text style={[styles.rowArrow, { color: theme.textSecondary }]}>→</Text>
        </Pressable>
      </View>

      {/* Automatic tracking */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>AUTOMATIC TRACKING</Text>
        <Pressable
          onPress={chooseRefreshWindow}
          style={[styles.row, { backgroundColor: theme.surface, borderColor: theme.border }]}
        >
          <View style={{ flex: 1 }}>
            <Text style={[styles.rowLabel, { color: theme.textPrimary }]}>Catch-up Window</Text>
            <Text style={[styles.rowHint, { color: theme.textSecondary }]}>
              How far back to look for missed transactions
            </Text>
          </View>
          <Text style={[styles.rowValue, { color: theme.accentPrimary }]}>
            {refreshWindowDays} days
          </Text>
        </Pressable>
        <Pressable
          onPress={handleScanNow}
          disabled={scanning}
          style={[
            styles.row,
            { backgroundColor: theme.surface, borderColor: theme.border, opacity: scanning ? 0.5 : 1 },
          ]}
        >
          <View style={{ flex: 1 }}>
            <Text style={[styles.rowLabel, { color: theme.textPrimary }]}>
              {scanning ? 'Checking…' : 'Check Now'}
            </Text>
            <Text style={[styles.rowHint, { color: theme.textSecondary }]}>{lastScanLabel}</Text>
          </View>
          <Text style={[styles.rowArrow, { color: theme.textSecondary }]}>↻</Text>
        </Pressable>
        <Pressable
          onPress={() => {
            const hours = BACKGROUND_INTERVAL_MINUTES / 60;
            showAppModal(
              backgroundOn
                ? {
                    title: 'Background checks are on',
                    message:
                      `Android runs Flux's check roughly every ${hours} hours while the phone is ` +
                      'online, and Flux sends a notification for every transaction it applies.\n\n' +
                      'Some phones (Xiaomi, Oppo, Vivo, Samsung…) still delay or block this. If ' +
                      'alerts arrive late, set Flux\'s battery usage to "Unrestricted" in App info.',
                    buttons: [
                      { text: 'OK', style: 'cancel' },
                      { text: 'Open App info', style: 'default', onPress: () => void Linking.openSettings() },
                    ],
                  }
                : {
                    title: 'Background checks are off',
                    message:
                      'Android is restricting Flux\'s background work, so balances only update when ' +
                      'you open the app.\n\nOpen App info → Battery, choose "Unrestricted", then reopen Flux.',
                    buttons: [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Open App info', style: 'default', onPress: () => void Linking.openSettings() },
                    ],
                  }
            );
          }}
          style={[styles.row, { backgroundColor: theme.surface, borderColor: theme.border }]}
        >
          <View style={{ flex: 1 }}>
            <Text style={[styles.rowLabel, { color: theme.textPrimary }]}>Background Checks</Text>
            <Text style={[styles.rowHint, { color: theme.textSecondary }]}>
              {backgroundOn === null
                ? 'Checking…'
                : backgroundOn
                  ? `On — about every ${BACKGROUND_INTERVAL_MINUTES / 60} hours`
                  : 'Restricted by Android — tap to fix'}
            </Text>
          </View>
          <View
            style={[styles.statusDot, { backgroundColor: backgroundOn ? theme.success : theme.warning }]}
          />
        </Pressable>
        <Text style={[styles.sectionFootnote, { color: theme.textSecondary }]}>
          Flux applies new transactions as they arrive while it is open, catches up whenever you
          open it or pull down to refresh, and checks in the background every few hours. You get a
          notification for every balance it updates.
        </Text>
      </View>

      {/* Permissions section */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>PERMISSIONS</Text>
        <Pressable
          onPress={async () => {
            if (!smsAvailable) {
              showAppModal({ title: 'Not available', message: 'SMS reading is only available on Android.' });
              return;
            }
            if (smsGranted) {
              showAppModal({ title: 'Already granted', message: 'SMS permission is already enabled.' });
              return;
            }
            const granted = await requestSmsAccess();
            setSmsGranted(granted);
            if (granted) {
              showAppModal({
                title: 'SMS Access Granted',
                message: "Flux will now read messages from your wallets' sender IDs and keep balances current.",
              });
            }
          }}
          style={[styles.row, { backgroundColor: theme.surface, borderColor: theme.border }]}
        >
          <View style={{ flex: 1 }}>
            <Text style={[styles.rowLabel, { color: theme.textPrimary }]}>SMS Access</Text>
            <Text style={[styles.rowHint, { color: theme.textSecondary }]}>
              {smsGranted ? 'Granted — wallet SMS are read automatically' : 'Off — tap to allow'}
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
            requestNotificationAccess();
          }}
          style={[styles.row, { backgroundColor: theme.surface, borderColor: theme.border }]}
        >
          <View style={{ flex: 1 }}>
            <Text style={[styles.rowLabel, { color: theme.textPrimary }]}>Notification Access</Text>
            <Text style={[styles.rowHint, { color: theme.textSecondary }]}>
              {notifGranted
                ? 'Granted — wallet-app alerts are captured'
                : 'Off — tap to open settings (manual toggle required)'}
            </Text>
          </View>
          <View style={[styles.statusDot, { backgroundColor: notifGranted ? theme.success : theme.warning }]} />
        </Pressable>
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

      {/* About */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>ABOUT</Text>
        <Pressable
          onPress={() => {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            checkForUpdatesNow();
          }}
          style={[styles.row, { backgroundColor: theme.surface, borderColor: theme.border }]}
        >
          <View style={{ flex: 1 }}>
            <Text style={[styles.rowLabel, { color: theme.textPrimary }]}>Check for Updates</Text>
            <Text style={[styles.rowHint, { color: theme.textSecondary }]}>
              Flux {version.name} (build {version.code})
            </Text>
          </View>
          <Text style={[styles.rowArrow, { color: theme.textSecondary }]}>↻</Text>
        </Pressable>
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
  sectionFootnote: {
    fontFamily: 'Sora_400Regular',
    fontSize: 12,
    lineHeight: 17,
    marginTop: 10,
    paddingHorizontal: 4,
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
