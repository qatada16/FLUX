import React, { useState, useRef } from 'react';
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
import { router, useLocalSearchParams } from 'expo-router';
import { useTheme, chartPalette } from '../../src/theme';
import { providerTemplates } from '../../src/constants/providers';
import { ProviderIcon } from '../../src/components/ProviderIcon';
import { useWalletStore } from '../../src/store/walletStore';
import { useAuthStore } from '../../src/store/authStore';
import { pushAllWalletsToCloud } from '../../src/lib/sync';
import type { Wallet, TrackingMethod } from '../../src/types/wallet';

interface WalletConfig {
  balance: string;
  trackingMethod: TrackingMethod;
  smsSender: string;
  notificationPackage: string;
}

export default function ConfigureWalletsScreen() {
  const { theme } = useTheme();
  const { keys } = useLocalSearchParams<{ keys: string }>();
  const addWallet = useWalletStore((s) => s.addWallet);
  const completeOnboarding = useWalletStore((s) => s.completeOnboarding);

  const selectedKeys = (keys || '').split(',').filter(Boolean);
  const providers = selectedKeys
    .map((k) => providerTemplates.find((p) => p.key === k))
    .filter(Boolean) as typeof providerTemplates;

  // Current step index — configure one wallet at a time
  const [currentIndex, setCurrentIndex] = useState(0);
  const scrollRef = useRef<ScrollView>(null);

  // Config state for each wallet, keyed by provider key
  const [configs, setConfigs] = useState<Record<string, WalletConfig>>(() => {
    const initial: Record<string, WalletConfig> = {};
    for (const p of providers) {
      initial[p.key] = {
        balance: '',
        trackingMethod: p.defaultTrackingMethod,
        smsSender: p.defaultSmsSender || '',
        notificationPackage: p.defaultNotificationPackage || '',
      };
    }
    return initial;
  });

  const currentProvider = providers[currentIndex];
  if (!currentProvider) return null;

  const config = configs[currentProvider.key];

  const updateConfig = (field: keyof WalletConfig, value: string) => {
    setConfigs((prev) => ({
      ...prev,
      [currentProvider.key]: { ...prev[currentProvider.key], [field]: value },
    }));
  };

  const setTrackingMethod = (method: TrackingMethod) => {
    updateConfig('trackingMethod', method);
  };

  const isLastWallet = currentIndex === providers.length - 1;

  const handleNext = () => {
    if (isLastWallet) {
      // Save all wallets to the store
      providers.forEach((provider, index) => {
        const cfg = configs[provider.key];
        const wallet: Wallet = {
          id: `${provider.key}-${Date.now()}-${index}`,
          providerKey: provider.key,
          displayName: provider.displayName,
          balance: parseFloat(cfg.balance) || 0,
          currency: 'PKR',
          trackingMethod: cfg.trackingMethod as TrackingMethod,
          smsSender: cfg.trackingMethod === 'sms' ? cfg.smsSender : undefined,
          notificationPackage: cfg.trackingMethod === 'notification' ? cfg.notificationPackage : undefined,
          color: chartPalette[index % chartPalette.length],
          icon: provider.icon,
          isActive: true,
          updatedAt: new Date().toISOString(),
        };
        addWallet(wallet);
      });
      completeOnboarding();

      // Sync to cloud if logged in
      const user = useAuthStore.getState().user;
      if (user) {
        pushAllWalletsToCloud(user.id);
      }

      router.replace('/dashboard');
    } else {
      setCurrentIndex((i) => i + 1);
      scrollRef.current?.scrollTo({ y: 0, animated: true });
    }
  };

  const handleBack = () => {
    if (currentIndex > 0) {
      setCurrentIndex((i) => i - 1);
      scrollRef.current?.scrollTo({ y: 0, animated: true });
    } else {
      router.back();
    }
  };

  const trackingMethods: { key: TrackingMethod; label: string; description: string }[] = [
    { key: 'sms', label: 'SMS', description: 'Read balance from incoming SMS' },
    { key: 'notification', label: 'Notification', description: 'Read from app notifications' },
    { key: 'manual', label: 'Manual', description: 'Update balance yourself' },
  ];

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: theme.background }]}
      behavior={Platform.OS === 'android' ? 'height' : 'padding'}
    >
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={handleBack}>
          <Text style={[styles.backButton, { color: theme.accentTertiary }]}>← Back</Text>
        </Pressable>
        <Text style={[styles.stepIndicator, { color: theme.textSecondary }]}>
          {currentIndex + 1} of {providers.length}
        </Text>
      </View>

      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Wallet identity */}
        <View style={styles.walletHeader}>
          <ProviderIcon
            providerKey={currentProvider.key}
            displayName={currentProvider.displayName}
            size={56}
          />
          <Text style={[styles.walletName, { color: theme.textPrimary }]}>
            {currentProvider.displayName}
          </Text>
          <Text style={[styles.walletType, { color: theme.textSecondary }]}>
            {currentProvider.type === 'wallet' ? 'Mobile Wallet' : 'Bank Account'}
          </Text>
        </View>

        {/* Balance input */}
        <View style={styles.fieldGroup}>
          <Text style={[styles.label, { color: theme.textSecondary }]}>Current Balance (PKR)</Text>
          <View style={[styles.inputRow, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Text style={[styles.currencyPrefix, { color: theme.textSecondary }]}>Rs.</Text>
            <TextInput
              style={[styles.balanceInput, { color: theme.textPrimary }]}
              value={config.balance}
              onChangeText={(v) => updateConfig('balance', v.replace(/[^0-9.]/g, ''))}
              placeholder="0.00"
              placeholderTextColor={theme.textSecondary + '60'}
              keyboardType="decimal-pad"
              returnKeyType="done"
            />
          </View>
        </View>

        {/* Tracking method */}
        <View style={styles.fieldGroup}>
          <Text style={[styles.label, { color: theme.textSecondary }]}>
            How should we track this balance?
          </Text>
          {trackingMethods.map((method) => {
            const isActive = config.trackingMethod === method.key;
            return (
              <Pressable
                key={method.key}
                onPress={() => setTrackingMethod(method.key)}
                style={[
                  styles.methodCard,
                  {
                    backgroundColor: isActive ? theme.surfaceElevated : theme.surface,
                    borderColor: isActive ? theme.accentPrimary : theme.border,
                  },
                ]}
              >
                <View style={styles.methodHeader}>
                  <View
                    style={[
                      styles.radio,
                      {
                        borderColor: isActive ? theme.accentPrimary : theme.border,
                      },
                    ]}
                  >
                    {isActive && (
                      <View style={[styles.radioInner, { backgroundColor: theme.accentPrimary }]} />
                    )}
                  </View>
                  <View style={styles.methodTextArea}>
                    <Text style={[styles.methodLabel, { color: theme.textPrimary }]}>
                      {method.label}
                    </Text>
                    <Text style={[styles.methodDesc, { color: theme.textSecondary }]}>
                      {method.description}
                    </Text>
                  </View>
                </View>
              </Pressable>
            );
          })}
        </View>

        {/* SMS sender config */}
        {config.trackingMethod === 'sms' && (
          <View style={styles.fieldGroup}>
            <Text style={[styles.label, { color: theme.textSecondary }]}>
              SMS Sender ID
            </Text>
            <TextInput
              style={[styles.textInput, { backgroundColor: theme.surface, borderColor: theme.border, color: theme.textPrimary }]}
              value={config.smsSender}
              onChangeText={(v) => updateConfig('smsSender', v)}
              placeholder="e.g. 8558"
              placeholderTextColor={theme.textSecondary + '60'}
            />
            <Text style={[styles.hint, { color: theme.textSecondary }]}>
              Check your SMS inbox to find the exact sender name/number for {currentProvider.displayName}.
            </Text>
          </View>
        )}

        {/* Notification package config */}
        {config.trackingMethod === 'notification' && (
          <View style={styles.fieldGroup}>
            <Text style={[styles.label, { color: theme.textSecondary }]}>
              App Package Name
            </Text>
            <TextInput
              style={[styles.textInput, { backgroundColor: theme.surface, borderColor: theme.border, color: theme.textPrimary }]}
              value={config.notificationPackage}
              onChangeText={(v) => updateConfig('notificationPackage', v)}
              placeholder="e.g. com.example.app"
              placeholderTextColor={theme.textSecondary + '60'}
              autoCapitalize="none"
            />
            <Text style={[styles.hint, { color: theme.textSecondary }]}>
              The Android package name of the {currentProvider.displayName} app. Pre-filled with the default — edit if yours is different.
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Bottom action */}
      <View style={[styles.bottomBar, { borderTopColor: theme.border }]}>
        {/* Progress dots */}
        <View style={styles.dots}>
          {providers.map((_, i) => (
            <View
              key={i}
              style={[
                styles.dot,
                {
                  backgroundColor: i === currentIndex ? theme.accentPrimary : theme.border,
                  width: i === currentIndex ? 20 : 8,
                },
              ]}
            />
          ))}
        </View>
        <Pressable
          onPress={handleNext}
          style={({ pressed }) => [
            styles.ctaButton,
            { backgroundColor: theme.accentPrimary, opacity: pressed ? 0.85 : 1 },
          ]}
        >
          <Text style={styles.ctaText}>
            {isLastWallet ? 'Finish Setup' : 'Next Wallet'}
          </Text>
        </Pressable>
      </View>
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
  stepIndicator: {
    fontFamily: 'Sora_500Medium',
    fontSize: 14,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingBottom: 24,
  },
  walletHeader: {
    alignItems: 'center',
    marginVertical: 24,
  },
  walletName: {
    fontFamily: 'Sora_700Bold',
    fontSize: 22,
    marginTop: 12,
  },
  walletType: {
    fontFamily: 'Sora_400Regular',
    fontSize: 13,
    marginTop: 4,
  },
  fieldGroup: {
    marginBottom: 24,
  },
  label: {
    fontFamily: 'Sora_600SemiBold',
    fontSize: 13,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 16,
    height: 56,
  },
  currencyPrefix: {
    fontFamily: 'Sora_600SemiBold',
    fontSize: 16,
    marginRight: 8,
  },
  balanceInput: {
    flex: 1,
    fontFamily: 'Sora_600SemiBold',
    fontSize: 22,
  },
  methodCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    marginBottom: 10,
  },
  methodHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  methodTextArea: {
    flex: 1,
  },
  methodLabel: {
    fontFamily: 'Sora_600SemiBold',
    fontSize: 15,
  },
  methodDesc: {
    fontFamily: 'Sora_400Regular',
    fontSize: 12,
    marginTop: 2,
  },
  textInput: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 16,
    height: 50,
    fontFamily: 'Sora_400Regular',
    fontSize: 15,
  },
  hint: {
    fontFamily: 'Sora_400Regular',
    fontSize: 12,
    marginTop: 8,
    lineHeight: 17,
  },
  bottomBar: {
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderTopWidth: 1,
    gap: 14,
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
  },
  dot: {
    height: 8,
    borderRadius: 4,
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
