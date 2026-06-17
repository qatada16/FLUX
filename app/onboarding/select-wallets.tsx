import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { router } from 'expo-router';
import { useTheme } from '../../src/theme';
import { providerTemplates, type ProviderTemplate } from '../../src/constants/providers';
import { ProviderIcon } from '../../src/components/ProviderIcon';
import { useWalletStore } from '../../src/store/walletStore';

export default function SelectWalletsScreen() {
  const { theme } = useTheme();
  const existingProviderKeys = useWalletStore((s) =>
    new Set(s.wallets.map((w) => w.providerKey))
  );
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const toggle = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const wallets = providerTemplates.filter((p) => p.type === 'wallet');
  const banks = providerTemplates.filter((p) => p.type === 'bank');

  const canContinue = selected.size > 0;

  const handleContinue = () => {
    // Pass selected provider keys to the config screen
    const keys = Array.from(selected).join(',');
    router.push({ pathname: '/onboarding/configure-wallets', params: { keys } });
  };

  const renderSection = (title: string, items: ProviderTemplate[]) => (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>{title}</Text>
      {items.map((provider) => {
        const isAlreadyAdded = existingProviderKeys.has(provider.key);
        const isSelected = selected.has(provider.key);
        return (
          <Pressable
            key={provider.key}
            onPress={() => !isAlreadyAdded && toggle(provider.key)}
            disabled={isAlreadyAdded}
            style={[
              styles.providerRow,
              {
                backgroundColor: isAlreadyAdded
                  ? theme.surface
                  : isSelected
                    ? theme.surfaceElevated
                    : theme.surface,
                borderColor: isAlreadyAdded
                  ? theme.border
                  : isSelected
                    ? theme.accentPrimary
                    : theme.border,
                opacity: isAlreadyAdded ? 0.45 : 1,
              },
            ]}
          >
            <ProviderIcon providerKey={provider.key} displayName={provider.displayName} size={40} />
            <View style={styles.providerInfo}>
              <Text style={[styles.providerName, { color: theme.textPrimary }]}>
                {provider.displayName}
              </Text>
              <Text style={[styles.providerMethod, { color: theme.textSecondary }]}>
                {isAlreadyAdded ? 'Already added' : `Default: ${provider.defaultTrackingMethod.toUpperCase()}`}
              </Text>
            </View>
            {isAlreadyAdded ? (
              <View
                style={[
                  styles.checkbox,
                  {
                    borderColor: theme.border,
                    backgroundColor: theme.border,
                  },
                ]}
              >
                <Text style={styles.checkmark}>✓</Text>
              </View>
            ) : (
              <View
                style={[
                  styles.checkbox,
                  {
                    borderColor: isSelected ? theme.accentPrimary : theme.border,
                    backgroundColor: isSelected ? theme.accentPrimary : 'transparent',
                  },
                ]}
              >
                {isSelected && <Text style={styles.checkmark}>✓</Text>}
              </View>
            )}
          </Pressable>
        );
      })}
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.textPrimary }]}>Select Your Accounts</Text>
        <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
          Pick the wallets and banks you use. You can always add more later.
        </Text>
      </View>

      {/* Scrollable provider list */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {renderSection('Mobile Wallets', wallets)}
        {renderSection('Banks', banks)}
      </ScrollView>

      {/* Bottom CTA */}
      <View style={[styles.bottomBar, { borderTopColor: theme.border }]}>
        <Text style={[styles.selectedCount, { color: theme.textSecondary }]}>
          {selected.size} selected
        </Text>
        <Pressable
          onPress={handleContinue}
          disabled={!canContinue}
          style={({ pressed }) => [
            styles.ctaButton,
            {
              backgroundColor: canContinue ? theme.accentPrimary : theme.border,
              opacity: pressed && canContinue ? 0.85 : 1,
            },
          ]}
        >
          <Text style={[styles.ctaText, { color: canContinue ? '#0B0E14' : theme.textSecondary }]}>
            Continue
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 60,
  },
  header: {
    paddingHorizontal: 24,
    marginBottom: 20,
  },
  title: {
    fontFamily: 'Sora_700Bold',
    fontSize: 24,
    marginBottom: 8,
  },
  subtitle: {
    fontFamily: 'Sora_400Regular',
    fontSize: 14,
    lineHeight: 20,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingBottom: 20,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontFamily: 'Sora_600SemiBold',
    fontSize: 13,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  providerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 10,
    gap: 14,
  },
  providerInfo: {
    flex: 1,
  },
  providerName: {
    fontFamily: 'Sora_600SemiBold',
    fontSize: 15,
  },
  providerMethod: {
    fontFamily: 'Sora_400Regular',
    fontSize: 12,
    marginTop: 2,
  },
  checkbox: {
    width: 26,
    height: 26,
    borderRadius: 8,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkmark: {
    fontSize: 14,
    color: '#0B0E14',
    fontWeight: 'bold',
  },
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderTopWidth: 1,
  },
  selectedCount: {
    fontFamily: 'Sora_500Medium',
    fontSize: 14,
  },
  ctaButton: {
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 28,
  },
  ctaText: {
    fontFamily: 'Sora_600SemiBold',
    fontSize: 15,
  },
});
