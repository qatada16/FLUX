import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { uuidv4 } from '../lib/uuid';

export interface PendingAiMessage {
  id: string;
  walletId: string;
  walletName: string;
  providerKey: string;
  source: 'sms' | 'notification';
  body: string;
  timestamp: number;
}

interface AiQueueState {
  pendingMessages: PendingAiMessage[];
  enqueueMessage: (msg: Omit<PendingAiMessage, 'id'>) => void;
  dequeueMessage: (id: string) => void;
  clearQueue: () => void;
}

export const useAiQueueStore = create<AiQueueState>()(
  persist(
    (set) => ({
      pendingMessages: [],

      enqueueMessage: (msg) =>
        set((state) => {
          const exists = state.pendingMessages.some(
            (item) =>
              item.walletId === msg.walletId &&
              item.body === msg.body &&
              Math.abs(item.timestamp - msg.timestamp) < 5000
          );
          if (exists) return state;

          return {
            pendingMessages: [
              ...state.pendingMessages,
              { ...msg, id: uuidv4() },
            ],
          };
        }),

      dequeueMessage: (id) =>
        set((state) => ({
          pendingMessages: state.pendingMessages.filter((item) => item.id !== id),
        })),

      clearQueue: () => set({ pendingMessages: [] }),
    }),
    {
      name: 'flux-ai-queue-storage',
      storage: createJSONStorage(() => AsyncStorage),
      version: 1,
    }
  )
);
