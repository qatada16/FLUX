import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  RefreshControl,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { router } from 'expo-router';
import { useTheme } from '../src/theme';
import { useTransactionStore } from '../src/store/transactionStore';
import { useAuthStore } from '../src/store/authStore';
import { pullTransactionsFromCloud } from '../src/lib/transactionSync';
import { EmptyState } from '../src/components/EmptyState';
import type { Transaction } from '../src/types/transaction';

export default function TransactionsScreen() {
  const { theme } = useTheme();
  const transactions = useTransactionStore((s) => s.transactions);
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    const user = useAuthStore.getState().user;
    if (user) await pullTransactionsFromCloud(user.id);
    setRefreshing(false);
  }, []);

  // Pull the latest history from the cloud when the screen opens (best-effort;
  // local data shows immediately and merges with unsynced entries).
  useEffect(() => {
    const user = useAuthStore.getState().user;
    if (user) void pullTransactionsFromCloud(user.id);
  }, []);

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()}>
          <Text style={[styles.backButton, { color: theme.accentTertiary }]}>← Back</Text>
        </Pressable>
        <Text style={[styles.title, { color: theme.textPrimary }]}>History</Text>
        <View style={{ width: 50 }} />
      </View>

      {transactions.length === 0 ? (
        <View style={styles.emptyWrap}>
          <EmptyState
            title="No Transactions Yet"
            message="When Flux reads an SMS or notification and updates a balance, it will show up here."
          />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={theme.accentPrimary}
              colors={[theme.accentPrimary]}
              progressBackgroundColor={theme.surface}
            />
          }
        >
          <Text style={[styles.caption, { color: theme.textSecondary }]}>
            Last {transactions.length} transaction{transactions.length !== 1 ? 's' : ''}
          </Text>
          {transactions.map((tx, index) => (
            <TransactionRow key={tx.id} tx={tx} index={index} />
          ))}
          <View style={{ height: 24 }} />
        </ScrollView>
      )}
    </View>
  );
}

function TransactionRow({ tx, index }: { tx: Transaction; index: number }) {
  const { theme } = useTheme();
  const isCredit = tx.direction === 'credit';
  const color = isCredit ? theme.success : theme.danger;
  const sign = isCredit ? '+' : '−';
  const arrow = isCredit ? '↓' : '↑'; // incoming vs outgoing

  return (
    <Animated.View
      entering={FadeInDown.delay(Math.min(index, 12) * 40).duration(350)}
      style={[styles.row, { backgroundColor: theme.surface, borderColor: theme.border }]}
    >
      {/* Direction badge */}
      <View style={[styles.iconCircle, { backgroundColor: color + '1A' }]}>
        <Text style={[styles.arrow, { color }]}>{arrow}</Text>
      </View>

      {/* Middle: wallet name + timestamp */}
      <View style={styles.info}>
        <Text style={[styles.walletName, { color: theme.textPrimary }]} numberOfLines={1}>
          {tx.walletName}
        </Text>
        <Text style={[styles.timestamp, { color: theme.textSecondary }]}>
          {formatDateTime(tx.createdAt)}
          {tx.source === 'manual' ? '  ·  Manual' : ''}
        </Text>
      </View>

      {/* Amount */}
      <Text style={[styles.amount, { color }]}>
        {sign} Rs. {tx.amount.toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </Text>
    </Animated.View>
  );
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString('en-PK', { day: 'numeric', month: 'short' });
  const time = d.toLocaleTimeString('en-PK', { hour: 'numeric', minute: '2-digit', hour12: true });
  return `${date}, ${time}`;
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
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  backButton: {
    fontFamily: 'Sora_500Medium',
    fontSize: 15,
  },
  title: {
    fontFamily: 'Sora_700Bold',
    fontSize: 20,
  },
  emptyWrap: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  list: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  caption: {
    fontFamily: 'Sora_600SemiBold',
    fontSize: 12,
    letterSpacing: 1,
    marginBottom: 12,
    marginTop: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    marginBottom: 10,
    gap: 14,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrow: {
    fontFamily: 'Sora_700Bold',
    fontSize: 20,
    lineHeight: 24,
  },
  info: {
    flex: 1,
  },
  walletName: {
    fontFamily: 'Sora_600SemiBold',
    fontSize: 15,
    marginBottom: 3,
  },
  timestamp: {
    fontFamily: 'Sora_400Regular',
    fontSize: 12,
  },
  amount: {
    fontFamily: 'Sora_700Bold',
    fontSize: 15,
  },
});
