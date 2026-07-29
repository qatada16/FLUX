import { supabase, isSupabaseConfigured } from './supabase';
import {
  useAiKeysStore,
  AI_PROVIDERS,
  type AiKeys,
  type AiUsage,
} from '../store/aiKeysStore';

// One row per user; RLS restricts every operation to auth.uid() = user_id.
const TABLE = 'ai_keys';

function rowToState(row: any): { keys: AiKeys; usage: AiUsage } {
  const keys: AiKeys = {};
  const usage: AiUsage = {};
  for (const p of AI_PROVIDERS) {
    const k = row[`${p}_key`];
    if (typeof k === 'string' && k.trim()) keys[p] = k.trim();
    usage[p] = Number(row[`${p}_usage`] ?? 0) || 0;
  }
  return { keys, usage };
}

function stateToRow(userId: string, keys: AiKeys, usage: AiUsage) {
  const row: Record<string, unknown> = { user_id: userId };
  for (const p of AI_PROVIDERS) {
    row[`${p}_key`] = keys[p] ?? null;
    row[`${p}_usage`] = usage[p] ?? 0;
  }
  return row;
}

/** Load this user's keys from the cloud into the local cache. */
export async function pullAiKeys(userId: string): Promise<boolean> {
  if (!isSupabaseConfigured) return false;
  try {
    const { data, error } = await supabase
      .from(TABLE)
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      console.error('Pull AI keys error:', error.message);
      return false;
    }

    const state = useAiKeysStore.getState();
    if (!data) {
      // No cloud row yet. Keep local edits if they belong to this user,
      // otherwise start clean so another account's cache is never reused.
      if (state.userId !== userId) state.hydrate(userId, {}, {});
      return true;
    }

    const { keys, usage } = rowToState(data);
    // Local unsynced edits win, so keys typed offline aren't lost.
    if (state.userId === userId && state.dirty) {
      state.hydrate(userId, { ...keys, ...state.keys }, { ...usage, ...state.usage });
      useAiKeysStore.setState({ dirty: true });
    } else {
      state.hydrate(userId, keys, usage);
    }
    return true;
  } catch (err) {
    console.error('Pull AI keys exception:', err);
    return false;
  }
}

/** Push local keys/usage for this user to the cloud. */
export async function pushAiKeys(userId: string): Promise<boolean> {
  if (!isSupabaseConfigured) return false;
  try {
    const { userId: cachedUser, keys, usage } = useAiKeysStore.getState();
    if (cachedUser && cachedUser !== userId) return false;

    const { error } = await supabase
      .from(TABLE)
      .upsert([stateToRow(userId, keys, usage)], { onConflict: 'user_id' });

    if (error) {
      console.error('Push AI keys error:', error.message);
      return false;
    }
    useAiKeysStore.getState().markSynced();
    return true;
  } catch (err) {
    console.error('Push AI keys exception:', err);
    return false;
  }
}

/** Push only when there are unsynced changes. */
export async function flushAiKeys(userId: string): Promise<void> {
  if (!useAiKeysStore.getState().dirty) return;
  await pushAiKeys(userId);
}
