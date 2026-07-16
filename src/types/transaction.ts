export interface Transaction {
  id: string; // UUID — also the Supabase row id
  walletId: string;
  walletName: string; // denormalized so history renders even if wallet is gone
  amount: number; // always positive; direction gives the sign
  direction: 'credit' | 'debit';
  balanceAfter: number; // wallet balance immediately after this transaction
  source: 'sms' | 'notification' | 'manual';
  createdAt: string; // ISO timestamp
  synced: boolean; // false until pushed to the cloud
}
