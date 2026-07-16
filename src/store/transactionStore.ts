import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Transaction } from '../types/transaction';
import { uuidv4 } from '../lib/uuid';

// We only ever keep the newest N transactions — both locally and in the cloud
// (a DB trigger enforces the same cap server-side).
export const MAX_TRANSACTIONS = 50;

interface TransactionState {
  transactions: Transaction[]; // newest first

  // Append a transaction (called whenever an SMS/notification changes a
  // balance). Returns the created record so callers can push it to the cloud.
  addTransaction: (
    tx: Omit<Transaction, 'id' | 'createdAt' | 'synced'>
  ) => Transaction;
  // Mark the given ids as synced to the cloud.
  markSynced: (ids: string[]) => void;
  // Replace the whole list from a cloud pull (already newest-first, capped).
  setTransactions: (transactions: Transaction[]) => void;
  // Clear everything (used on "Reset All Data").
  clear: () => void;
}

function trim(list: Transaction[]): Transaction[] {
  return list.length > MAX_TRANSACTIONS ? list.slice(0, MAX_TRANSACTIONS) : list;
}

export const useTransactionStore = create<TransactionState>()(
  persist(
    (set) => ({
      transactions: [],

      addTransaction: (tx) => {
        const record: Transaction = {
          ...tx,
          id: uuidv4(),
          createdAt: new Date().toISOString(),
          synced: false,
        };
        set((state) => ({
          transactions: trim([record, ...state.transactions]),
        }));
        return record;
      },

      markSynced: (ids) =>
        set((state) => {
          const idSet = new Set(ids);
          return {
            transactions: state.transactions.map((t) =>
              idSet.has(t.id) ? { ...t, synced: true } : t
            ),
          };
        }),

      setTransactions: (transactions) => set({ transactions: trim(transactions) }),

      clear: () => set({ transactions: [] }),
    }),
    {
      name: 'flux-transaction-storage',
      storage: createJSONStorage(() => AsyncStorage),
      version: 1,
    }
  )
);
