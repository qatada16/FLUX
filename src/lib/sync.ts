import { supabase, isSupabaseConfigured } from './supabase';
import { useWalletStore } from '../store/walletStore';
import type { Wallet } from '../types/wallet';

// Result of a cloud pull: distinguishes a real failure ('error') from a
// successful request that simply found no rows ('empty'). Callers must not
// treat 'empty' as an error.
export type PullResult = 'found' | 'empty' | 'error';

function rowToWallet(row: any): Wallet {
  return {
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
  };
}

/**
 * Pull all wallets for the current user from Supabase and merge them into the
 * local store.
 *
 * Merge rules (local-first — SMS parsing happens on this device, so local
 * data is usually the freshest):
 *  - Same wallet on both sides → keep whichever has the newer updatedAt.
 *  - Cloud wallet queued for deletion locally → drop it (delete is pending).
 *  - Local-only wallet with unsynced changes (dirty) → keep it; it will be
 *    pushed by the next flush. Without pending changes it means the wallet
 *    was deleted from another device → let it go.
 */
export async function pullWalletsFromCloud(userId: string): Promise<PullResult> {
  if (!isSupabaseConfigured) return 'error';
  try {
    const { data, error } = await supabase
      .from('wallets')
      .select('*')
      .eq('user_id', userId);

    if (error) {
      console.error('Pull wallets error:', error.message);
      return 'error';
    }

    if (!data || data.length === 0) {
      return 'empty'; // No wallets in cloud — not an error
    }

    const store = useWalletStore.getState();
    const pendingDeletes = new Set(store.pendingDeletes);
    const localById = new Map(store.wallets.map((w) => [w.id, w]));

    const merged: Wallet[] = [];
    const cloudIds = new Set<string>();

    for (const row of data) {
      if (pendingDeletes.has(row.id)) continue; // deletion outranks the pull
      cloudIds.add(row.id);
      const cloud = rowToWallet(row);
      const local = localById.get(cloud.id);
      const localIsNewer =
        local && new Date(local.updatedAt).getTime() > new Date(cloud.updatedAt).getTime();
      merged.push(localIsNewer ? local : cloud);
    }

    // Local-only wallets: keep them only if they have unsynced changes.
    if (store.dirty) {
      for (const w of store.wallets) {
        if (!cloudIds.has(w.id) && !pendingDeletes.has(w.id)) {
          merged.push(w);
        }
      }
    }

    useWalletStore.getState().setWallets(merged);
    if (merged.length > 0 && !useWalletStore.getState().hasCompletedOnboarding) {
      useWalletStore.getState().completeOnboarding();
    }
    return merged.length > 0 ? 'found' : 'empty';
  } catch (err) {
    console.error('Pull wallets exception:', err);
    return 'error';
  }
}

// Push all local wallets to Supabase (upsert). Clears the dirty flag on
// success — everything local is now on the cloud.
export async function pushAllWalletsToCloud(userId: string): Promise<boolean> {
  if (!isSupabaseConfigured) return false;
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

    if (rows.length > 0) {
      const { error } = await supabase
        .from('wallets')
        .upsert(rows, { onConflict: 'id' });

      if (error) {
        console.error('Push wallets error:', error.message);
        return false;
      }
    }

    useWalletStore.getState().markSynced();
    return true;
  } catch (err) {
    console.error('Push wallets exception:', err);
    return false;
  }
}

// Push a single wallet's balance update to Supabase. Opportunistic fast-path:
// if it fails (offline), the wallet store is already marked dirty and the
// change is re-pushed by the next flushPendingSync().
export async function pushBalanceUpdate(walletId: string, balance: number): Promise<boolean> {
  if (!isSupabaseConfigured) return false;
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

// Delete a wallet from Supabase. On success the id is confirmed against the
// pending-deletes queue; on failure it stays queued and is retried by
// flushPendingSync().
export async function deleteWalletFromCloud(walletId: string): Promise<boolean> {
  if (!isSupabaseConfigured) return false;
  try {
    const { error } = await supabase
      .from('wallets')
      .delete()
      .eq('id', walletId);

    if (error) {
      console.error('Delete wallet error:', error.message);
      return false;
    }

    useWalletStore.getState().confirmDeletes([walletId]);
    return true;
  } catch (err) {
    console.error('Delete wallet exception:', err);
    return false;
  }
}

/**
 * Flush everything the cloud is missing: retry queued deletions, then push
 * local wallets if they have unsynced changes. Safe to call whenever — it
 * no-ops when there is nothing to do. Called on app foreground, after
 * sign-in, and before a pull-to-refresh.
 *
 * Pass `force: true` to push even when the store isn't marked dirty (used
 * right after sign-in to seed an empty cloud account).
 */
export async function flushPendingSync(
  userId: string,
  opts: { force?: boolean } = {}
): Promise<void> {
  if (!isSupabaseConfigured) return;
  try {
    const { pendingDeletes, dirty } = useWalletStore.getState();

    for (const id of pendingDeletes) {
      await deleteWalletFromCloud(id); // confirms its own success
    }

    if (dirty || opts.force) {
      await pushAllWalletsToCloud(userId);
    }
  } catch (err) {
    console.error('Flush pending sync exception:', err);
  }
}
