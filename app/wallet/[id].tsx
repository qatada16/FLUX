import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { showAppModal } from '../../src/components/AppModal';
import { useLocalSearchParams, router } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../src/theme';
import { useWalletStore } from '../../src/store/walletStore';
import { useAuthStore } from '../../src/store/authStore';
import { pushBalanceUpdate, deleteWalletFromCloud, pushAllWalletsToCloud } from '../../src/lib/sync';
import { recordTransaction } from '../../src/lib/transactionSync';
import { notifyTransaction } from '../../src/lib/notify';
import { ProviderIcon } from '../../src/components/ProviderIcon';
import type { TrackingMethod } from '../../src/types/wallet';

type BalanceMode = 'set' | 'add' | 'subtract';

const QUICK_AMOUNTS = [100, 500, 1000, 5000];
// Nine integer digits is the most the input accepts, so this is the ceiling a
// single typed figure can reach; adding two of them is what we guard against.
const MAX_BALANCE = 999999999.99;

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

const formatAmount = (n: number) =>
  n.toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Keeps the field to a single dot, two decimals and nine integer digits, so a
// stray keystroke can't produce a value parseFloat would silently truncate.
const sanitizeAmount = (raw: string) => {
  let v = raw.replace(/[^0-9.]/g, '');
  const firstDot = v.indexOf('.');
  if (firstDot !== -1) {
    v = v.slice(0, firstDot + 1) + v.slice(firstDot + 1).replace(/\./g, '');
  }
  const [intPart, decPart] = v.split('.');
  const clippedInt = intPart.slice(0, 9);
  return decPart === undefined ? clippedInt : `${clippedInt}.${decPart.slice(0, 2)}`;
};

export default function WalletDetailScreen() {
  const { theme } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const wallet = useWalletStore((s) => s.wallets.find((w) => w.id === id));
  const updateWallet = useWalletStore((s) => s.updateWallet);
  const updateBalance = useWalletStore((s) => s.updateBalance);
  const removeWallet = useWalletStore((s) => s.removeWallet);

  const [editBalance, setEditBalance] = useState('');
  const [balanceMode, setBalanceMode] = useState<BalanceMode>('set');
  const [isEditing, setIsEditing] = useState(false);
  const [editMethod, setEditMethod] = useState<TrackingMethod | null>(null);
  const [editSender, setEditSender] = useState('');
  const [editPackage, setEditPackage] = useState('');
  const [newSmsSender, setNewSmsSender] = useState('');

  const handleAddSmsSender = () => {
    const trimmed = newSmsSender.trim();
    if (!trimmed) return;
    const currentSenders = editSender
      ? editSender.split(',').map((s) => s.trim()).filter(Boolean)
      : [];
    if (!currentSenders.includes(trimmed)) {
      const updatedSenders = [...currentSenders, trimmed];
      setEditSender(updatedSenders.join(', '));
    }
    setNewSmsSender('');
  };

  const handleRemoveSmsSender = (senderToRemove: string) => {
    const currentSenders = editSender
      ? editSender.split(',').map((s) => s.trim()).filter(Boolean)
      : [];
    const updatedSenders = currentSenders.filter((s) => s !== senderToRemove);
    setEditSender(updatedSenders.join(', '));
  };

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
    setBalanceMode('set');
    setEditBalance(wallet.balance.toString());
    setEditMethod(wallet.trackingMethod);
    setEditSender(wallet.smsSender || '');
    setEditPackage(wallet.notificationPackage || '');
    setNewSmsSender('');
  };

  // What the user typed: an absolute target in 'set' mode, otherwise the amount
  // to move. An empty field means "leave the balance alone" — never zero it.
  const typedAmount = parseFloat(editBalance);
  const hasAmount = Number.isFinite(typedAmount);

  const newBalance = !hasAmount
    ? wallet.balance
    : balanceMode === 'set'
      ? round2(typedAmount)
      : balanceMode === 'add'
        ? round2(wallet.balance + typedAmount)
        : round2(wallet.balance - typedAmount);

  const delta = round2(newBalance - wallet.balance);
  const belowZero = newBalance < 0;
  const overMax = newBalance > MAX_BALANCE;
  const balanceValid = !belowZero && !overMax;

  const changeMode = (next: BalanceMode) => {
    if (next === balanceMode) return;
    void Haptics.selectionAsync();
    setBalanceMode(next);
    // The absolute balance is only a sensible starting value in 'set' mode —
    // carrying it into 'add' would offer to double the wallet.
    setEditBalance(next === 'set' ? wallet.balance.toString() : '');
  };

  const bumpAmount = (increment: number) => {
    void Haptics.selectionAsync();
    const base = Number.isFinite(typedAmount) ? typedAmount : 0;
    setEditBalance(sanitizeAmount(String(round2(base + increment))));
  };

  const clearAmount = () => {
    void Haptics.selectionAsync();
    setEditBalance('');
  };

  const modeStyles: Record<BalanceMode, { label: string; sign: string; color: string }> = {
    set: { label: 'Set', sign: '', color: theme.accentTertiary },
    add: { label: 'Add', sign: '+', color: theme.success },
    subtract: { label: 'Subtract', sign: '−', color: theme.danger },
  };
  const activeMode = modeStyles[balanceMode];

  const saveChanges = () => {
    if (!balanceValid) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    if (newBalance !== wallet.balance) {
      updateBalance(wallet.id, newBalance);
      // Record the manual adjustment in history too.
      recordTransaction({
        walletId: wallet.id,
        walletName: wallet.displayName,
        amount: Math.abs(delta),
        direction: delta >= 0 ? 'credit' : 'debit',
        balanceAfter: newBalance,
        source: 'manual',
      });
      void notifyTransaction({
        walletName: wallet.displayName,
        amount: Math.abs(delta),
        direction: delta >= 0 ? 'credit' : 'debit',
        balanceAfter: newBalance,
      });
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
    showAppModal({
      title: 'Remove Wallet',
      message: `Are you sure you want to remove ${wallet.displayName}? This cannot be undone.`,
      buttons: [
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
      ],
    });
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

            {/* Stays on screen while editing, so the figure being adjusted is
                never something the user has to remember. */}
            <Text
              style={[
                isEditing ? styles.balanceAnchor : styles.balanceValue,
                { color: isEditing ? theme.textSecondary : theme.textPrimary },
              ]}
            >
              Rs. {formatAmount(wallet.balance)}
            </Text>

            {isEditing && (
              <>
                <View style={styles.modeRow}>
                  {(['set', 'add', 'subtract'] as BalanceMode[]).map((m) => {
                    const active = balanceMode === m;
                    const cfg = modeStyles[m];
                    return (
                      <Pressable
                        key={m}
                        onPress={() => changeMode(m)}
                        accessibilityRole="button"
                        accessibilityState={{ selected: active }}
                        accessibilityLabel={`${cfg.label} balance`}
                        style={({ pressed }) => [
                          styles.modeChip,
                          {
                            backgroundColor: active ? cfg.color : theme.surfaceElevated,
                            borderColor: active ? cfg.color : theme.border,
                            opacity: pressed ? 0.85 : 1,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.modeChipText,
                            { color: active ? '#0B0E14' : theme.textSecondary },
                          ]}
                        >
                          {cfg.sign ? `${cfg.sign} ` : ''}{cfg.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                <View style={[styles.balanceInputRow, { borderColor: activeMode.color }]}>
                  {!!activeMode.sign && (
                    <Text style={[styles.signPrefix, { color: activeMode.color }]}>
                      {activeMode.sign}
                    </Text>
                  )}
                  <Text style={[styles.currencyPrefix, { color: theme.textSecondary }]}>Rs.</Text>
                  <TextInput
                    style={[styles.balanceInput, { color: theme.textPrimary }]}
                    value={editBalance}
                    onChangeText={(v) => setEditBalance(sanitizeAmount(v))}
                    keyboardType="decimal-pad"
                    autoFocus
                    selectTextOnFocus
                    placeholder="0.00"
                    placeholderTextColor={theme.textSecondary + '60'}
                    accessibilityLabel={
                      balanceMode === 'set' ? 'New balance' : `Amount to ${balanceMode}`
                    }
                  />
                </View>

                <View style={styles.quickRow}>
                  {QUICK_AMOUNTS.map((amt) => (
                    <Pressable
                      key={amt}
                      onPress={() => bumpAmount(amt)}
                      accessibilityRole="button"
                      accessibilityLabel={`Add ${amt} to the amount`}
                      style={({ pressed }) => [
                        styles.quickChip,
                        {
                          backgroundColor: theme.surfaceElevated,
                          borderColor: theme.border,
                          opacity: pressed ? 0.7 : 1,
                        },
                      ]}
                    >
                      <Text style={[styles.quickChipText, { color: activeMode.color }]}>
                        {activeMode.sign || '+'}
                        {amt.toLocaleString('en-PK')}
                      </Text>
                    </Pressable>
                  ))}
                  {editBalance !== '' && (
                    <Pressable
                      onPress={clearAmount}
                      accessibilityRole="button"
                      accessibilityLabel="Clear amount"
                      style={({ pressed }) => [
                        styles.quickChip,
                        { borderColor: theme.border, opacity: pressed ? 0.7 : 1 },
                      ]}
                    >
                      <Text style={[styles.quickChipText, { color: theme.textSecondary }]}>
                        Clear
                      </Text>
                    </Pressable>
                  )}
                </View>

                {/* Live result — the arithmetic the user used to do in their head */}
                <View
                  style={[
                    styles.previewBox,
                    {
                      borderColor: balanceValid ? theme.border : theme.danger,
                      backgroundColor: theme.surfaceElevated,
                    },
                  ]}
                >
                  <Text style={[styles.previewLabel, { color: theme.textSecondary }]}>
                    New balance
                  </Text>
                  <View style={styles.previewRow}>
                    <Text
                      style={[
                        styles.previewValue,
                        { color: balanceValid ? theme.textPrimary : theme.danger },
                      ]}
                    >
                      Rs. {formatAmount(newBalance)}
                    </Text>
                    {delta !== 0 && balanceValid && (
                      <View
                        style={[
                          styles.deltaPill,
                          { backgroundColor: (delta > 0 ? theme.success : theme.danger) + '1F' },
                        ]}
                      >
                        <Text
                          style={[
                            styles.deltaText,
                            { color: delta > 0 ? theme.success : theme.danger },
                          ]}
                        >
                          {delta > 0 ? '+' : '−'}
                          {formatAmount(Math.abs(delta))}
                        </Text>
                      </View>
                    )}
                  </View>
                  {delta === 0 && balanceValid && (
                    <Text style={[styles.previewHint, { color: theme.textSecondary }]}>
                      No change to the balance yet
                    </Text>
                  )}
                  {belowZero && (
                    <Text style={[styles.previewHint, { color: theme.danger }]}>
                      That would leave −Rs. {formatAmount(Math.abs(newBalance))}. Balance can't go
                      below Rs. 0.00 — the most you can subtract is Rs.{' '}
                      {formatAmount(wallet.balance)}.
                    </Text>
                  )}
                  {overMax && (
                    <Text style={[styles.previewHint, { color: theme.danger }]}>
                      That's above the maximum of Rs. {formatAmount(MAX_BALANCE)}.
                    </Text>
                  )}
                </View>
              </>
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
                  <Text style={[styles.configFieldLabel, { color: theme.textSecondary, marginBottom: 8 }]}>
                    SMS Sender IDs
                  </Text>

                  {/* List of active chips */}
                  <View style={styles.chipsContainer}>
                    {(editSender ? editSender.split(',').map(s => s.trim()).filter(Boolean) : []).map((sender) => (
                      <View key={sender} style={[styles.chip, { backgroundColor: theme.surfaceElevated, borderColor: theme.border }]}>
                        <Text style={[styles.chipText, { color: theme.textPrimary }]}>{sender}</Text>
                        <Pressable onPress={() => handleRemoveSmsSender(sender)} style={styles.chipDeleteBtn}>
                          <Text style={[styles.chipDeleteText, { color: theme.danger }]}>×</Text>
                        </Pressable>
                      </View>
                    ))}
                    {(editSender ? editSender.split(',').map(s => s.trim()).filter(Boolean) : []).length === 0 && (
                      <Text style={{ color: theme.danger, fontSize: 13, fontFamily: 'Sora_400Regular', marginBottom: 4 }}>
                        Please add at least one sender ID.
                      </Text>
                    )}
                  </View>

                  {/* Input field + Add button */}
                  <View style={styles.smsSenderContainer}>
                    <TextInput
                      style={[styles.smsSenderInput, { backgroundColor: theme.surfaceElevated, borderColor: theme.border, color: theme.textPrimary }]}
                      value={newSmsSender}
                      onChangeText={setNewSmsSender}
                      onSubmitEditing={handleAddSmsSender}
                      placeholder="e.g. 8558"
                      placeholderTextColor={theme.textSecondary + '60'}
                      returnKeyType="done"
                    />
                    <Pressable
                      onPress={handleAddSmsSender}
                      style={({ pressed }) => [
                        styles.smsAddBtn,
                        { backgroundColor: theme.accentPrimary, opacity: pressed ? 0.85 : 1 }
                      ]}
                    >
                      <Text style={[styles.smsAddBtnText, { color: '#0B0E14' }]}>+ Add</Text>
                    </Pressable>
                  </View>
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
                disabled={!balanceValid}
                accessibilityRole="button"
                accessibilityState={{ disabled: !balanceValid }}
                style={({ pressed }) => [
                  styles.actionBtn,
                  {
                    backgroundColor: theme.accentPrimary,
                    opacity: !balanceValid ? 0.4 : pressed ? 0.85 : 1,
                  },
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
  balanceAnchor: {
    fontFamily: 'Sora_600SemiBold',
    fontSize: 20,
    marginBottom: 14,
  },
  modeRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  modeChip: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    paddingVertical: 10,
    alignItems: 'center',
  },
  modeChipText: {
    fontFamily: 'Sora_600SemiBold',
    fontSize: 13,
  },
  signPrefix: {
    fontFamily: 'Sora_700Bold',
    fontSize: 26,
    marginRight: 6,
  },
  balanceInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 2,
    paddingBottom: 8,
    marginBottom: 8,
  },
  quickRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 6,
    marginBottom: 16,
  },
  quickChip: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  quickChipText: {
    fontFamily: 'Sora_600SemiBold',
    fontSize: 13,
  },
  previewBox: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    marginBottom: 12,
  },
  previewLabel: {
    fontFamily: 'Sora_500Medium',
    fontSize: 11,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 10,
  },
  previewValue: {
    fontFamily: 'Sora_700Bold',
    fontSize: 24,
  },
  deltaPill: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  deltaText: {
    fontFamily: 'Sora_600SemiBold',
    fontSize: 13,
  },
  previewHint: {
    fontFamily: 'Sora_400Regular',
    fontSize: 12,
    lineHeight: 17,
    marginTop: 8,
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
  smsSenderContainer: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  smsSenderInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 16,
    height: 50,
    fontFamily: 'Sora_400Regular',
    fontSize: 15,
  },
  smsAddBtn: {
    borderRadius: 14,
    paddingHorizontal: 20,
    height: 50,
    justifyContent: 'center',
    alignItems: 'center',
  },
  smsAddBtnText: {
    fontFamily: 'Sora_600SemiBold',
    fontSize: 15,
  },
  chipsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  chipText: {
    fontFamily: 'Sora_500Medium',
    fontSize: 14,
  },
  chipDeleteBtn: {
    marginLeft: 8,
    padding: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  chipDeleteText: {
    fontFamily: 'Sora_600SemiBold',
    fontSize: 18,
    lineHeight: 18,
  },
});
