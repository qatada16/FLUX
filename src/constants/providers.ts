import { chartPalette } from '../theme';
import type { TrackingMethod } from '../types/wallet';

export interface ProviderTemplate {
  key: string;
  displayName: string;
  type: 'wallet' | 'bank';
  defaultTrackingMethod: TrackingMethod;
  defaultSmsSender?: string;
  defaultNotificationPackage?: string;
  icon: string; // placeholder icon name
}

export const providerTemplates: ProviderTemplate[] = [
  {
    key: 'jazzcash',
    displayName: 'JazzCash',
    type: 'wallet',
    defaultTrackingMethod: 'sms',
    defaultSmsSender: '8558',
    icon: 'jazzcash',
  },
  {
    key: 'easypaisa',
    displayName: 'Easypaisa',
    type: 'wallet',
    defaultTrackingMethod: 'notification',
    defaultNotificationPackage: 'pk.com.telenor.phoenix',
    icon: 'easypaisa',
  },
  {
    key: 'sadapay',
    displayName: 'SadaPay',
    type: 'wallet',
    defaultTrackingMethod: 'notification',
    defaultNotificationPackage: 'com.sadapay.app',
    icon: 'sadapay',
  },
  {
    key: 'nayapay',
    displayName: 'NayaPay',
    type: 'wallet',
    defaultTrackingMethod: 'notification',
    defaultNotificationPackage: 'com.nayapay.app',
    icon: 'nayapay',
  },
  {
    key: 'meezan',
    displayName: 'Meezan Bank',
    type: 'bank',
    defaultTrackingMethod: 'sms',
    defaultSmsSender: 'Meezan',
    icon: 'meezan',
  },
  {
    key: 'faysal',
    displayName: 'Faysal Bank',
    type: 'bank',
    defaultTrackingMethod: 'sms',
    defaultSmsSender: 'FaysalBank',
    icon: 'faysal',
  },
  {
    key: 'hbl',
    displayName: 'HBL',
    type: 'bank',
    defaultTrackingMethod: 'sms',
    defaultSmsSender: 'HBL',
    icon: 'hbl',
  },
  {
    key: 'ubl',
    displayName: 'UBL',
    type: 'bank',
    defaultTrackingMethod: 'sms',
    defaultSmsSender: 'UBL',
    icon: 'ubl',
  },
  {
    key: 'alfalah',
    displayName: 'Bank Alfalah',
    type: 'bank',
    defaultTrackingMethod: 'sms',
    defaultSmsSender: 'Alfalah',
    icon: 'alfalah',
  },
  {
    key: 'mcb',
    displayName: 'MCB',
    type: 'bank',
    defaultTrackingMethod: 'sms',
    defaultSmsSender: 'MCB',
    icon: 'mcb',
  },
];

// Assign a color from the chart palette to each provider
export function getProviderColor(index: number): string {
  return chartPalette[index % chartPalette.length];
}
