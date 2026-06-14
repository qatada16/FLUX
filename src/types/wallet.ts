export interface Wallet {
  id: string;
  providerKey: string;
  displayName: string;
  balance: number;
  currency: string;
  trackingMethod: 'sms' | 'notification' | 'manual';
  smsSender?: string;
  notificationPackage?: string;
  color: string;
  icon: string;
  isActive: boolean;
  updatedAt: string;
}

export type TrackingMethod = Wallet['trackingMethod'];
