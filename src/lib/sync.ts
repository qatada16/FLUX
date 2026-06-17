import { supabase } from './supabase';
import { useWalletStore } from '../store/walletStore';
import type { Wallet } from '../types/wallet';

// Result of a cloud pull: distinguishes a real failure ('error') from a
// successful request that simply found no rows ('empty'). Callers must not
// treat 'empty' as an error (that was the cause of the false "Could not sync
// with cloud" banner).
export type PullResult = 'found' | 'empty' | 'error';

// Pull all wallets for the current user from Supabase into the local store.
export async function pullWalletsFromCloud(userId: string): Promise<PullResult> {
  try {
    const { data, error } = await supabase
      .from('wallets')
      .select('*')
      .eq('user_id', userId);

    if (error) {
      console.error('Pull wallets error:', error.message);
      return 'error';
    }

    if (data && data.length > 0) {
      const wallets: Wallet[] = data.map((row) => ({
        id: row.id,
        providerKey: row.provider_key,
        displayName: row.display_name,
        balance: parseFloat(row.balance),
        currency: row.currency,
        trackingMethod: row.tracking_method,
        smsSender: row.sms_sender ?? undefined,
        notificationPackage: row.notification_package ?? undefined,
        color: row.color ?? '#00F5A0',
        icon: row.icon ?? '',
        isActive: row.is_active,
        updatedAt: row.updated_at,
      }));

      useWalletStore.getState().setWallets(wallets);
      if (!useWalletStore.getState().hasCompletedOnboarding) {
        useWalletStore.getState().completeOnboarding();
      }
      return 'found';
    }

    return 'empty'; // No wallets in cloud — not an error
  } catch (err) {
    console.error('Pull wallets exception:', err);
    return 'error';
  }
}

// Push all local wallets to Supabase (upsert).
export async function pushAllWalletsToCloud(userId: string): Promise<boolean> {
  try {
    const wallets = useWalletStore.getState().wallets;

    const rows = wallets.map((w) => ({
      id: w.id,
      user_id: userId,
      provider_key: w.providerKey,
      display_name: w.displayName,
      balance: w.balance,
      currency: w.currency,
      tracking_method: w.trackingMethod,
      sms_sender: w.smsSender ?? null,
      notification_package: w.notificationPackage ?? null,
      color: w.color,
      icon: w.icon,
      is_active: w.isActive,
      updated_at: w.updatedAt,
    }));

    const { error } = await supabase
      .from('wallets')
      .upsert(rows, { onConflict: 'id' });

    if (error) {
      console.error('Push wallets error:', error.message);
      return false;
    }

    return true;
  } catch (err) {
    console.error('Push wallets exception:', err);
    return false;
  }
}

// Push a single wallet's balance update to Supabase.
export async function pushBalanceUpdate(walletId: string, balance: number): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('wallets')
      .update({ balance, updated_at: new Date().toISOString() })
      .eq('id', walletId);

    if (error) {
      console.error('Push balance error:', error.message);
      return false;
    }

    return true;
  } catch (err) {
    console.error('Push balance exception:', err);
    return false;
  }
}

// Delete a wallet from Supabase.
export async function deleteWalletFromCloud(walletId: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('wallets')
      .delete()
      .eq('id', walletId);

    if (error) {
      console.error('Delete wallet error:', error.message);
      return false;
    }

    return true;
  } catch (err) {
    console.error('Delete wallet exception:', err);
    return false;
  }
}
