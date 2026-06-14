import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

// Simple colored circle with initials as placeholder icons.
// Can be replaced with real logos later.
const iconColors: Record<string, string> = {
  jazzcash: '#E2001A',
  easypaisa: '#4CAF50',
  sadapay: '#1A1A2E',
  nayapay: '#6C3FE2',
  meezan: '#006837',
  faysal: '#003366',
  hbl: '#00724A',
  ubl: '#ED1C24',
  alfalah: '#C8102E',
  mcb: '#0033A0',
};

interface ProviderIconProps {
  providerKey: string;
  displayName: string;
  size?: number;
  color?: string;
}

export function ProviderIcon({ providerKey, displayName, size = 44, color }: ProviderIconProps) {
  const bgColor = color || iconColors[providerKey] || '#555';
  // Get up to 2 initials from the display name
  const initials = displayName
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <View style={[styles.container, { width: size, height: size, borderRadius: size / 2, backgroundColor: bgColor }]}>
      <Text style={[styles.initials, { fontSize: size * 0.36 }]}>{initials}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: {
    fontFamily: 'Sora_700Bold',
    color: '#FFFFFF',
  },
});
