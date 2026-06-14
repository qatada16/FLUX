import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, Pressable } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { PieChart, BarChart } from 'react-native-gifted-charts';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../src/theme';
import { useWalletStore } from '../src/store/walletStore';
import { useAuthStore } from '../src/store/authStore';
import { pullWalletsFromCloud } from '../src/lib/sync';
import { AnimatedBalance } from '../src/components/AnimatedBalance';
import { WalletCard } from '../src/components/WalletCard';

export default function DashboardScreen() {
  const { theme } = useTheme();
  const wallets = useWalletStore((s) => s.wallets);
  const [refreshing, setRefreshing] = useState(false);
  const [highlightedWalletId, setHighlightedWalletId] = useState<string | null>(null);

  const totalBalance = wallets.reduce((sum, w) => sum + w.balance, 0);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    const user = useAuthStore.getState().user;
    if (user) {
      await pullWalletsFromCloud(user.id);
    }
    setRefreshing(false);
  }, []);

  // Donut chart data
  const pieData = wallets
    .filter((w) => w.balance > 0)
    .map((w) => ({
      value: w.balance,
      color: w.color,
      text: w.displayName,
      focused: highlightedWalletId === w.id,
      onPress: () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        setHighlightedWalletId((prev) => (prev === w.id ? null : w.id));
      },
    }));

  // Bar chart data
  const barData = wallets.map((w) => ({
    value: w.balance,
    label: w.displayName.length > 6 ? w.displayName.slice(0, 6) + '..' : w.displayName,
    frontColor: w.color,
    topLabelComponent: () => (
      <Text style={[styles.barTopLabel, { color: theme.textSecondary }]}>
        {w.balance >= 1000 ? `${(w.balance / 1000).toFixed(0)}k` : w.balance.toFixed(0)}
      </Text>
    ),
  }));

  const maxBarValue = Math.max(...wallets.map((w) => w.balance), 1);

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.background }]}
      contentContainerStyle={styles.content}
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
      {/* Header */}
      <Animated.View entering={FadeInDown.duration(500)} style={styles.headerRow}>
        <View>
          <Text style={[styles.greeting, { color: theme.textSecondary }]}>
            Your Portfolio
          </Text>
          <Text style={[styles.headerTitle, { color: theme.textPrimary }]}>
            Flux
          </Text>
        </View>
        <Pressable
          onPress={() => router.push('/settings')}
          style={[styles.settingsBtn, { backgroundColor: theme.surface, borderColor: theme.border }]}
        >
          <Text style={[styles.settingsIcon, { color: theme.textSecondary }]}>⚙</Text>
        </Pressable>
      </Animated.View>

      {/* Hero total balance */}
      <Animated.View entering={FadeInDown.delay(100).duration(500)}>
        <LinearGradient
          colors={[theme.accentPrimary, theme.accentSecondary]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.heroCard}
        >
          <Text style={styles.heroLabel}>TOTAL BALANCE</Text>
          <AnimatedBalance
            value={totalBalance}
            style={styles.heroBalance}
            duration={1000}
          />
          <Text style={styles.heroWalletCount}>
            {wallets.length} account{wallets.length !== 1 ? 's' : ''} connected
          </Text>
        </LinearGradient>
      </Animated.View>

      {/* Donut Chart */}
      {pieData.length > 0 && (
        <Animated.View entering={FadeInDown.delay(200).duration(500)}>
          <View style={[styles.chartCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>
              DISTRIBUTION
            </Text>
            <View style={styles.pieContainer}>
              <PieChart
                data={pieData}
                donut
                radius={90}
                innerRadius={55}
                innerCircleColor={theme.surface}
                centerLabelComponent={() => (
                  <View style={styles.pieCenter}>
                    <Text style={[styles.pieCenterLabel, { color: theme.textSecondary }]}>
                      Total
                    </Text>
                    <Text style={[styles.pieCenterValue, { color: theme.textPrimary }]}>
                      {wallets.length}
                    </Text>
                  </View>
                )}
                focusOnPress
                sectionAutoFocus
              />
            </View>
            {/* Legend */}
            <View style={styles.legend}>
              {wallets.filter((w) => w.balance > 0).map((w) => {
                const pct = totalBalance > 0 ? ((w.balance / totalBalance) * 100).toFixed(1) : '0';
                return (
                  <Pressable
                    key={w.id}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setHighlightedWalletId((prev) => (prev === w.id ? null : w.id));
                    }}
                    style={styles.legendItem}
                  >
                    <View style={[styles.legendDot, { backgroundColor: w.color }]} />
                    <Text style={[styles.legendText, { color: theme.textSecondary }]}>
                      {w.displayName}
                    </Text>
                    <Text style={[styles.legendPct, { color: theme.textPrimary }]}>
                      {pct}%
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </Animated.View>
      )}

      {/* Bar Chart */}
      {barData.length > 0 && (
        <Animated.View entering={FadeInDown.delay(300).duration(500)}>
          <View style={[styles.chartCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>
              COMPARISON
            </Text>
            <View style={styles.barContainer}>
              <BarChart
                data={barData}
                barWidth={28}
                spacing={20}
                roundedTop
                roundedBottom
                noOfSections={4}
                maxValue={maxBarValue * 1.15}
                yAxisThickness={0}
                xAxisThickness={1}
                xAxisColor={theme.border}
                yAxisTextStyle={{ color: theme.textSecondary, fontSize: 10, fontFamily: 'Sora_400Regular' }}
                xAxisLabelTextStyle={{ color: theme.textSecondary, fontSize: 9, fontFamily: 'Sora_400Regular' }}
                hideRules
                barBorderRadius={6}
                isAnimated
                animationDuration={600}
              />
            </View>
          </View>
        </Animated.View>
      )}

      {/* Wallet List */}
      <Text style={[styles.sectionTitleStandalone, { color: theme.textSecondary }]}>
        YOUR ACCOUNTS
      </Text>
      {wallets.map((wallet, index) => (
        <WalletCard
          key={wallet.id}
          wallet={wallet}
          index={index}
          highlighted={highlightedWalletId === wallet.id}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.push({ pathname: '/wallet/[id]', params: { id: wallet.id } });
          }}
        />
      ))}
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
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  greeting: {
    fontFamily: 'Sora_400Regular',
    fontSize: 13,
    marginBottom: 2,
  },
  headerTitle: {
    fontFamily: 'Sora_700Bold',
    fontSize: 26,
  },
  settingsBtn: {
    width: 42,
    height: 42,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingsIcon: {
    fontSize: 20,
  },
  heroCard: {
    borderRadius: 20,
    padding: 28,
    marginBottom: 20,
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
  chartCard: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 18,
    marginBottom: 20,
  },
  sectionTitle: {
    fontFamily: 'Sora_600SemiBold',
    fontSize: 12,
    letterSpacing: 1,
    marginBottom: 16,
  },
  sectionTitleStandalone: {
    fontFamily: 'Sora_600SemiBold',
    fontSize: 12,
    letterSpacing: 1,
    marginBottom: 14,
    marginTop: 4,
  },
  pieContainer: {
    alignItems: 'center',
    marginBottom: 16,
  },
  pieCenter: {
    alignItems: 'center',
  },
  pieCenterLabel: {
    fontFamily: 'Sora_400Regular',
    fontSize: 11,
  },
  pieCenterValue: {
    fontFamily: 'Sora_700Bold',
    fontSize: 22,
  },
  legend: {
    gap: 8,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendText: {
    fontFamily: 'Sora_400Regular',
    fontSize: 13,
    flex: 1,
  },
  legendPct: {
    fontFamily: 'Sora_600SemiBold',
    fontSize: 13,
  },
  barContainer: {
    alignItems: 'center',
    overflow: 'hidden',
  },
  barTopLabel: {
    fontFamily: 'Sora_500Medium',
    fontSize: 9,
    marginBottom: 4,
  },
});
