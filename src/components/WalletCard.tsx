import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useTheme } from '../theme';
import { ProviderIcon } from './ProviderIcon';
import type { Wallet } from '../types/wallet';

interface WalletCardProps {
  wallet: Wallet;
  index: number;
  highlighted?: boolean;
  onPress?: () => void;
}

export function WalletCard({ wallet, index, highlighted, onPress }: WalletCardProps) {
  const { theme } = useTheme();

  const timeSince = getTimeSince(wallet.updatedAt);

  return (
    <Animated.View entering={FadeInDown.delay(index * 80).duration(400).springify()}>
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [
          styles.card,
          {
            backgroundColor: highlighted ? theme.surfaceElevated : theme.surface,
            borderColor: highlighted ? wallet.color : theme.border,
            borderWidth: highlighted ? 1.5 : 1,
            opacity: pressed ? 0.9 : 1,
          },
        ]}
      >
        <ProviderIcon
          providerKey={wallet.providerKey}
          displayName={wallet.displayName}
          size={44}
          color={wallet.color}
        />
        <View style={styles.info}>
          <Text style={[styles.name, { color: theme.textPrimary }]}>
            {wallet.displayName}
          </Text>
          <View style={styles.metaRow}>
            <View style={[styles.badge, { backgroundColor: theme.surfaceElevated }]}>
              <Text style={[styles.badgeText, { color: theme.textSecondary }]}>
                {wallet.trackingMethod.toUpperCase()}
              </Text>
            </View>
            <Text style={[styles.updated, { color: theme.textSecondary }]}>
              {timeSince}
            </Text>
          </View>
        </View>
        <Text style={[styles.balance, { color: theme.textPrimary }]}>
          Rs. {wallet.balance.toLocaleString('en-PK', { minimumFractionDigits: 2 })}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

function getTimeSince(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    gap: 14,
  },
  info: {
    flex: 1,
  },
  name: {
    fontFamily: 'Sora_600SemiBold',
    fontSize: 15,
    marginBottom: 4,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  badge: {
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  badgeText: {
    fontFamily: 'Sora_500Medium',
    fontSize: 10,
    letterSpacing: 0.5,
  },
  updated: {
    fontFamily: 'Sora_400Regular',
    fontSize: 11,
  },
  balance: {
    fontFamily: 'Sora_700Bold',
    fontSize: 16,
  },
});
