import { supabase, isSupabaseConfigured } from './supabase';
import { useTransactionStore, MAX_TRANSACTIONS } from '../store/transactionStore';
import { useAuthStore } from '../store/authStore';
import type { Transaction } from '../types/transaction';

/**
 * Record a transaction locally (offline-first) and opportunistically push it
 * to the cloud. The local write always happens; the cloud push is best-effort
 * and, if it fails (offline), the entry stays `synced: false` and is retried
 * by flushPendingTransactions() on the next foreground / sign-in / refresh.
 *
 * This mirrors how balances are handled: update local storage no matter what,
 * sync when the network is available.
 */
export function recordTransaction(
  tx: Omit<Transaction, 'id' | 'createdAt' | 'synced'>
): void {
  const record = useTransactionStore.getState().addTransaction(tx);

  const user = useAuthStore.getState().user;
  if (user && isSupabaseConfigured) {
    void pushTransaction(user.id, record);
  }
}

function rowToTransaction(row: any): Transaction {
  return {
    id: row.id,
    walletId: row.wallet_id,
    walletName: row.wallet_name,
    amount: parseFloat(row.amount),
    direction: row.direction,
    balanceAfter: parseFloat(row.balance_after),
    source: row.source,
    createdAt: row.created_at,
    synced: true,
  };
}

function transactionToRow(userId: string, t: Transaction) {
  return {
    id: t.id,
    user_id: userId,
    wallet_id: t.walletId,
    wallet_name: t.walletName,
    amount: t.amount,
    direction: t.direction,
    balance_after: t.balanceAfter,
    source: t.source,
    created_at: t.createdAt,
  };
}

// Push a single transaction. The DB trigger trims the user's rows beyond
// MAX_TRANSACTIONS automatically, so we don't clean up here.
async function pushTransaction(userId: string, tx: Transaction): Promise<boolean> {
  if (!isSupabaseConfigured) return false;
  try {
    const { error } = await supabase
      .from('transactions')
      .upsert([transactionToRow(userId, tx)], { onConflict: 'id' });
    if (error) {
      console.error('Push transaction error:', error.message);
      return false;
    }
    useTransactionStore.getState().markSynced([tx.id]);
    return true;
  } catch (err) {
    console.error('Push transaction exception:', err);
    return false;
  }
}

/**
 * Push every not-yet-synced transaction. Called from the app's sync flush.
 */
export async function flushPendingTransactions(userId: string): Promise<void> {
  if (!isSupabaseConfigured) return;
  try {
    const pending = useTransactionStore
      .getState()
      .transactions.filter((t) => !t.synced);
    if (pending.length === 0) return;

    const rows = pending.map((t) => transactionToRow(userId, t));
    const { error } = await supabase
      .from('transactions')
      .upsert(rows, { onConflict: 'id' });
    if (error) {
      console.error('Flush transactions error:', error.message);
      return;
    }
    useTransactionStore.getState().markSynced(pending.map((t) => t.id));
  } catch (err) {
    console.error('Flush transactions exception:', err);
  }
}

/**
 * Pull the latest transactions from the cloud and merge with any local
 * unsynced entries (so a transaction recorded offline isn't lost when the
 * pull returns cloud rows that don't include it yet). Keeps newest N.
 */
export async function pullTransactionsFromCloud(userId: string): Promise<boolean> {
  if (!isSupabaseConfigured) return false;
  try {
    const { data, error } = await supabase
      .from('transactions')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(MAX_TRANSACTIONS);

    if (error) {
      console.error('Pull transactions error:', error.message);
      return false;
    }

    const cloud = (data ?? []).map(rowToTransaction);
    const cloudIds = new Set(cloud.map((t) => t.id));

    // Keep local entries the cloud doesn't have yet (offline, not flushed).
    const localUnsynced = useTransactionStore
      .getState()
      .transactions.filter((t) => !t.synced && !cloudIds.has(t.id));

    const merged = [...localUnsynced, ...cloud].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    useTransactionStore.getState().setTransactions(merged);
    return true;
  } catch (err) {
    console.error('Pull transactions exception:', err);
    return false;
  }
}
