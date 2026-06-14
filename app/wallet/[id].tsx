import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../src/theme';
import { useWalletStore } from '../../src/store/walletStore';
import { useAuthStore } from '../../src/store/authStore';
import { pushBalanceUpdate, deleteWalletFromCloud, pushAllWalletsToCloud } from '../../src/lib/sync';
import { ProviderIcon } from '../../src/components/ProviderIcon';
import type { TrackingMethod } from '../../src/types/wallet';

export default function WalletDetailScreen() {
  const { theme } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const wallet = useWalletStore((s) => s.wallets.find((w) => w.id === id));
  const updateWallet = useWalletStore((s) => s.updateWallet);
  const updateBalance = useWalletStore((s) => s.updateBalance);
  const removeWallet = useWalletStore((s) => s.removeWallet);

  const [editBalance, setEditBalance] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [editMethod, setEditMethod] = useState<TrackingMethod | null>(null);
  const [editSender, setEditSender] = useState('');
  const [editPackage, setEditPackage] = useState('');

  if (!wallet) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <Text style={[styles.errorText, { color: theme.danger }]}>Wallet not found</Text>
        <Pressable onPress={() => router.back()}>
          <Text style={[styles.backLink, { color: theme.accentTertiary }]}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  const startEditing = () => {
    setIsEditing(true);
    setEditBalance(wallet.balance.toString());
    setEditMethod(wallet.trackingMethod);
    setEditSender(wallet.smsSender || '');
    setEditPackage(wallet.notificationPackage || '');
  };

  const saveChanges = () => {
    const newBalance = parseFloat(editBalance) || 0;

    if (newBalance !== wallet.balance) {
      updateBalance(wallet.id, newBalance);
    }

    if (editMethod && editMethod !== wallet.trackingMethod) {
      updateWallet(wallet.id, {
        trackingMethod: editMethod,
        smsSender: editMethod === 'sms' ? editSender : undefined,
        notificationPackage: editMethod === 'notification' ? editPackage : undefined,
      });
    } else if (editMethod === 'sms' && editSender !== wallet.smsSender) {
      updateWallet(wallet.id, { smsSender: editSender });
    } else if (editMethod === 'notification' && editPackage !== wallet.notificationPackage) {
      updateWallet(wallet.id, { notificationPackage: editPackage });
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setIsEditing(false);

    // Sync to cloud in background
    const user = useAuthStore.getState().user;
    if (user) {
      if (newBalance !== wallet.balance) {
        pushBalanceUpdate(wallet.id, newBalance);
      }
      if (editMethod && editMethod !== wallet.trackingMethod) {
        pushAllWalletsToCloud(user.id);
      }
    }
  };

  const confirmDelete = () => {
    Alert.alert(
      'Remove Wallet',
      `Are you sure you want to remove ${wallet.displayName}? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            const user = useAuthStore.getState().user;
            removeWallet(wallet.id);
            if (user) deleteWalletFromCloud(wallet.id);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            router.back();
          },
        },
      ]
    );
  };

  const trackingMethods: { key: TrackingMethod; label: string }[] = [
    { key: 'sms', label: 'SMS' },
    { key: 'notification', label: 'Notification' },
    { key: 'manual', label: 'Manual' },
  ];

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: theme.background }]}
      behavior={Platform.OS === 'android' ? 'height' : 'padding'}
    >
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()}>
          <Text style={[styles.backButton, { color: theme.accentTertiary }]}>← Back</Text>
        </Pressable>
        {!isEditing && (
          <Pressable onPress={startEditing}>
            <Text style={[styles.editButton, { color: theme.accentPrimary }]}>Edit</Text>
          </Pressable>
        )}
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Wallet identity */}
        <Animated.View entering={FadeInDown.duration(400)} style={styles.identity}>
          <ProviderIcon
            providerKey={wallet.providerKey}
            displayName={wallet.displayName}
            size={64}
            color={wallet.color}
          />
          <Text style={[styles.walletName, { color: theme.textPrimary }]}>
            {wallet.displayName}
          </Text>
          <View style={[styles.typeBadge, { backgroundColor: theme.surfaceElevated }]}>
            <Text style={[styles.typeText, { color: theme.textSecondary }]}>
              {wallet.trackingMethod.toUpperCase()} tracking
            </Text>
          </View>
        </Animated.View>

        {/* Balance display or edit */}
        <Animated.View entering={FadeInDown.delay(100).duration(400)}>
          <View style={[styles.balanceCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Text style={[styles.balanceLabel, { color: theme.textSecondary }]}>Current Balance</Text>
            {isEditing ? (
              <View style={[styles.balanceInputRow, { borderColor: theme.accentPrimary }]}>
                <Text style={[styles.currencyPrefix, { color: theme.textSecondary }]}>Rs.</Text>
                <TextInput
                  style={[styles.balanceInput, { color: theme.textPrimary }]}
                  value={editBalance}
                  onChangeText={(v) => setEditBalance(v.replace(/[^0-9.]/g, ''))}
                  keyboardType="decimal-pad"
                  autoFocus
                  selectTextOnFocus
                />
              </View>
            ) : (
              <Text style={[styles.balanceValue, { color: theme.textPrimary }]}>
                Rs. {wallet.balance.toLocaleString('en-PK', { minimumFractionDigits: 2 })}
              </Text>
            )}
            <Text style={[styles.updatedAt, { color: theme.textSecondary }]}>
              Last updated: {new Date(wallet.updatedAt).toLocaleString()}
            </Text>
          </View>
        </Animated.View>

        {/* Tracking config (edit mode) */}
        {isEditing && (
          <Animated.View entering={FadeInDown.delay(150).duration(400)}>
            <View style={[styles.configCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <Text style={[styles.configLabel, { color: theme.textSecondary }]}>Tracking Method</Text>
              <View style={styles.methodRow}>
                {trackingMethods.map((m) => {
                  const active = editMethod === m.key;
                  return (
                    <Pressable
                      key={m.key}
                      onPress={() => setEditMethod(m.key)}
                      style={[
                        styles.methodChip,
                        {
                          backgroundColor: active ? theme.accentPrimary : theme.surfaceElevated,
                          borderColor: active ? theme.accentPrimary : theme.border,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.methodChipText,
                          { color: active ? '#0B0E14' : theme.textSecondary },
                        ]}
                      >
                        {m.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              {editMethod === 'sms' && (
                <View style={styles.configField}>
                  <Text style={[styles.configFieldLabel, { color: theme.textSecondary }]}>
                    SMS Sender ID
                  </Text>
                  <TextInput
                    style={[styles.configInput, { backgroundColor: theme.surfaceElevated, borderColor: theme.border, color: theme.textPrimary }]}
                    value={editSender}
                    onChangeText={setEditSender}
                    placeholder="e.g. 8558"
                    placeholderTextColor={theme.textSecondary + '60'}
                  />
                </View>
              )}

              {editMethod === 'notification' && (
                <View style={styles.configField}>
                  <Text style={[styles.configFieldLabel, { color: theme.textSecondary }]}>
                    App Package Name
                  </Text>
                  <TextInput
                    style={[styles.configInput, { backgroundColor: theme.surfaceElevated, borderColor: theme.border, color: theme.textPrimary }]}
                    value={editPackage}
                    onChangeText={setEditPackage}
                    placeholder="e.g. com.example.app"
                    placeholderTextColor={theme.textSecondary + '60'}
                    autoCapitalize="none"
                  />
                </View>
              )}
            </View>
          </Animated.View>
        )}

        {/* Action buttons */}
        <View style={styles.actions}>
          {isEditing ? (
            <>
              <Pressable
                onPress={saveChanges}
                style={({ pressed }) => [
                  styles.actionBtn,
                  { backgroundColor: theme.accentPrimary, opacity: pressed ? 0.85 : 1 },
                ]}
              >
                <Text style={styles.actionBtnText}>Save Changes</Text>
              </Pressable>
              <Pressable
                onPress={() => setIsEditing(false)}
                style={[styles.actionBtn, { backgroundColor: theme.surfaceElevated }]}
              >
                <Text style={[styles.actionBtnTextSecondary, { color: theme.textSecondary }]}>
                  Cancel
                </Text>
              </Pressable>
            </>
          ) : (
            <Pressable
              onPress={confirmDelete}
              style={[styles.actionBtn, { backgroundColor: theme.danger + '18' }]}
            >
              <Text style={[styles.actionBtnTextSecondary, { color: theme.danger }]}>
                Remove Wallet
              </Text>
            </Pressable>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 56,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    marginBottom: 8,
  },
  backButton: {
    fontFamily: 'Sora_500Medium',
    fontSize: 15,
  },
  editButton: {
    fontFamily: 'Sora_600SemiBold',
    fontSize: 15,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingBottom: 40,
  },
  identity: {
    alignItems: 'center',
    marginVertical: 24,
  },
  walletName: {
    fontFamily: 'Sora_700Bold',
    fontSize: 24,
    marginTop: 14,
  },
  typeBadge: {
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginTop: 8,
  },
  typeText: {
    fontFamily: 'Sora_500Medium',
    fontSize: 12,
    letterSpacing: 0.5,
  },
  balanceCard: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 22,
    marginBottom: 16,
  },
  balanceLabel: {
    fontFamily: 'Sora_600SemiBold',
    fontSize: 12,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  balanceValue: {
    fontFamily: 'Sora_700Bold',
    fontSize: 30,
    marginBottom: 8,
  },
  balanceInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 2,
    paddingBottom: 8,
    marginBottom: 8,
  },
  currencyPrefix: {
    fontFamily: 'Sora_600SemiBold',
    fontSize: 20,
    marginRight: 8,
  },
  balanceInput: {
    flex: 1,
    fontFamily: 'Sora_700Bold',
    fontSize: 28,
    padding: 0,
  },
  updatedAt: {
    fontFamily: 'Sora_400Regular',
    fontSize: 12,
  },
  configCard: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 22,
    marginBottom: 16,
  },
  configLabel: {
    fontFamily: 'Sora_600SemiBold',
    fontSize: 12,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  methodRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  methodChip: {
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  methodChipText: {
    fontFamily: 'Sora_600SemiBold',
    fontSize: 13,
  },
  configField: {
    marginTop: 4,
  },
  configFieldLabel: {
    fontFamily: 'Sora_500Medium',
    fontSize: 12,
    marginBottom: 8,
  },
  configInput: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    height: 46,
    fontFamily: 'Sora_400Regular',
    fontSize: 14,
  },
  actions: {
    gap: 10,
    marginTop: 8,
  },
  actionBtn: {
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  actionBtnText: {
    fontFamily: 'Sora_600SemiBold',
    fontSize: 16,
    color: '#0B0E14',
  },
  actionBtnTextSecondary: {
    fontFamily: 'Sora_600SemiBold',
    fontSize: 15,
  },
  errorText: {
    fontFamily: 'Sora_600SemiBold',
    fontSize: 18,
    textAlign: 'center',
    marginTop: 100,
  },
  backLink: {
    fontFamily: 'Sora_500Medium',
    fontSize: 15,
    textAlign: 'center',
    marginTop: 16,
  },
});
