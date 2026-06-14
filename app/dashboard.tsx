import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../src/theme';
import { useWalletStore } from '../src/store/walletStore';
import { ProviderIcon } from '../src/components/ProviderIcon';

export default function DashboardScreen() {
  const { theme } = useTheme();
  const wallets = useWalletStore((s) => s.wallets);

  const totalBalance = wallets.reduce((sum, w) => sum + w.balance, 0);

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.background }]}
      contentContainerStyle={styles.content}
    >
      {/* Hero total balance */}
      <LinearGradient
        colors={[theme.accentPrimary, theme.accentSecondary]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.heroCard}
      >
        <Text style={styles.heroLabel}>TOTAL BALANCE</Text>
        <Text style={styles.heroBalance}>
          Rs. {totalBalance.toLocaleString('en-PK', { minimumFractionDigits: 2 })}
        </Text>
        <Text style={styles.heroWalletCount}>
          {wallets.length} account{wallets.length !== 1 ? 's' : ''} connected
        </Text>
      </LinearGradient>

      {/* Wallet list */}
      <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>YOUR ACCOUNTS</Text>
      {wallets.map((wallet) => (
        <View
          key={wallet.id}
          style={[styles.walletCard, { backgroundColor: theme.surface, borderColor: theme.border }]}
        >
          <ProviderIcon
            providerKey={wallet.providerKey}
            displayName={wallet.displayName}
            size={42}
            color={wallet.color}
          />
          <View style={styles.walletInfo}>
            <Text style={[styles.walletName, { color: theme.textPrimary }]}>
              {wallet.displayName}
            </Text>
            <Text style={[styles.walletMethod, { color: theme.textSecondary }]}>
              {wallet.trackingMethod.toUpperCase()} tracking
            </Text>
          </View>
          <Text style={[styles.walletBalance, { color: theme.textPrimary }]}>
            Rs. {wallet.balance.toLocaleString('en-PK', { minimumFractionDigits: 2 })}
          </Text>
        </View>
      ))}

      <Text style={[styles.placeholder, { color: theme.textSecondary }]}>
        Charts and animations coming in Phase 2
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  heroCard: {
    borderRadius: 20,
    padding: 28,
    marginBottom: 28,
  },
  heroLabel: {
    fontFamily: 'Sora_600SemiBold',
    fontSize: 12,
    color: '#0B0E14',
    letterSpacing: 2,
    marginBottom: 8,
  },
  heroBalance: {
    fontFamily: 'Sora_700Bold',
    fontSize: 32,
    color: '#0B0E14',
    marginBottom: 6,
  },
  heroWalletCount: {
    fontFamily: 'Sora_400Regular',
    fontSize: 13,
    color: '#0B0E14',
    opacity: 0.7,
  },
  sectionTitle: {
    fontFamily: 'Sora_600SemiBold',
    fontSize: 13,
    letterSpacing: 1,
    marginBottom: 14,
  },
  walletCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    marginBottom: 10,
    gap: 14,
  },
  walletInfo: {
    flex: 1,
  },
  walletName: {
    fontFamily: 'Sora_600SemiBold',
    fontSize: 15,
  },
  walletMethod: {
    fontFamily: 'Sora_400Regular',
    fontSize: 12,
    marginTop: 2,
  },
  walletBalance: {
    fontFamily: 'Sora_700Bold',
    fontSize: 16,
  },
  placeholder: {
    fontFamily: 'Sora_400Regular',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 24,
  },
});
