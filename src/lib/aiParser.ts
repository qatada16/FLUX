import type { ParseResult } from './parsers/types';
import { useAiQueueStore } from '../store/aiQueueStore';
import { useWalletStore } from '../store/walletStore';
import { useAuthStore } from '../store/authStore';
import {
  useAiKeysStore,
  getUsableKeys,
  AI_PROVIDERS,
  AI_PROVIDER_LABELS,
  type AiProvider,
} from '../store/aiKeysStore';
import { containsPossibleAmount } from './aiPrefilter';
import { pushBalanceUpdate } from './sync';
import { recordTransaction } from './transactionSync';
import { notifyTransaction } from './notify';

const SYSTEM_PROMPT = `You are a financial transaction parser for bank and mobile wallet SMS/notifications in Pakistan.
Analyze the message and extract the transaction amount and new/available account balance.
Reply strictly in valid JSON format with NO markdown, NO code blocks, NO greetings, NO extra text.

Required JSON format:
{
  "Transaction": "+/-[Amount]",
  "New_Amount": "[New amount]"
}

Rules:
1. If money was debited, deducted, spent, sent, or transferred out, format "Transaction" as a negative number e.g. "-100" or "-1500.50".
2. If money was credited, received, deposited, or added, format "Transaction" as a positive number e.g. "+500" or "+2500".
3. If no transaction amount is detected, set "Transaction" to "".
4. If new, remaining, or available balance is stated, set "New_Amount" to the string e.g. "12500" or "12500.50".
5. If new balance is not stated, set "New_Amount" to "".
6. If neither is detected, set both to "".`;

// Result of an AI parse, including which provider produced it.
export interface AiParseOutcome {
  result: ParseResult;
  provider: AiProvider;
}

async function chatCompletion(
  url: string,
  key: string,
  model: string,
  text: string,
  label: string
): Promise<string> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: text },
      ],
      temperature: 0,
      max_tokens: 150,
    }),
  });
  if (!res.ok) throw new Error(`${label} error: ${res.status}`);
  const data = await res.json();
  return data?.choices?.[0]?.message?.content || '';
}

async function callGemini(key: string, text: string): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: `${SYSTEM_PROMPT}\n\nMessage: "${text}"` }] }],
      generationConfig: { temperature: 0, maxOutputTokens: 150 },
    }),
  });
  if (!res.ok) throw new Error(`Gemini error: ${res.status}`);
  const data = await res.json();
  return data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

function callProvider(provider: AiProvider, key: string, text: string): Promise<string> {
  switch (provider) {
    case 'cerebras':
      return chatCompletion(
        'https://api.cerebras.ai/v1/chat/completions',
        key,
        'llama3.1-8b',
        text,
        'Cerebras'
      );
    case 'mistral':
      return chatCompletion(
        'https://api.mistral.ai/v1/chat/completions',
        key,
        'mistral-small-latest',
        text,
        'Mistral'
      );
    case 'gemini':
      return callGemini(key, text);
    case 'groq':
      return chatCompletion(
        'https://api.groq.com/openai/v1/chat/completions',
        key,
        'llama-3.1-8b-instant',
        text,
        'Groq'
      );
  }
}

function parseAiJsonResponse(rawText: string): ParseResult | null {
  if (!rawText) return null;

  try {
    const cleaned = rawText.replace(/```json/gi, '').replace(/```/g, '').trim();

    const parsed = JSON.parse(cleaned);
    const rawTx = typeof parsed.Transaction === 'string' ? parsed.Transaction.trim() : '';
    const rawNew = typeof parsed.New_Amount === 'string' ? parsed.New_Amount.trim() : '';

    let amount = 0;
    let direction: 'credit' | 'debit' | null = null;
    let newBalance: number | undefined;

    if (rawTx) {
      if (rawTx.startsWith('-')) {
        direction = 'debit';
        amount = Math.abs(parseFloat(rawTx.replace(/,/g, '')));
      } else if (rawTx.startsWith('+')) {
        direction = 'credit';
        amount = Math.abs(parseFloat(rawTx.replace(/,/g, '')));
      } else {
        const num = parseFloat(rawTx.replace(/,/g, ''));
        if (!isNaN(num) && num > 0) {
          amount = num;
          direction = 'debit';
        }
      }
    }

    if (rawNew) {
      const num = parseFloat(rawNew.replace(/,/g, ''));
      if (!isNaN(num) && num >= 0) newBalance = num;
    }

    if (newBalance !== undefined && (!direction || isNaN(amount) || amount <= 0)) {
      return { amount: 0, direction: 'credit', newBalance };
    }

    if (direction && !isNaN(amount) && amount > 0) {
      return { amount, direction, newBalance };
    }

    return null;
  } catch {
    return null;
  }
}

/** True when the signed-in user has at least one AI key configured. */
export function hasAiKeys(): boolean {
  const user = useAuthStore.getState().user;
  const keys = getUsableKeys(user?.id);
  return AI_PROVIDERS.some((p) => !!keys[p]);
}

/**
 * Try each provider the user configured, in fallback order, until one returns
 * a usable result. Every attempt increments that provider's usage counter.
 * Returns null when the user has no keys or nothing parsed.
 */
export async function parseMessageWithAi(text: string): Promise<AiParseOutcome | null> {
  // Don't spend a call on messages with no number in them at all.
  if (!containsPossibleAmount(text)) return null;

  const user = useAuthStore.getState().user;
  const keys = getUsableKeys(user?.id);

  let lastError: unknown = null;
  let attempted = false;

  for (const provider of AI_PROVIDERS) {
    const key = keys[provider];
    if (!key) continue;

    attempted = true;
    useAiKeysStore.getState().incrementUsage(provider);
    try {
      const raw = await callProvider(provider, key, text);
      const result = parseAiJsonResponse(raw);
      if (result) return { result, provider };
    } catch (err) {
      lastError = err;
    }
  }

  // Signal "couldn't reach any provider" so callers can queue for retry,
  // instead of silently discarding the message.
  if (attempted && lastError) throw lastError;
  return null;
}

let isProcessingQueue = false;

export async function processPendingAiQueue(): Promise<void> {
  if (isProcessingQueue) return;
  if (!hasAiKeys()) return;
  isProcessingQueue = true;

  try {
    const queueStore = useAiQueueStore.getState();
    const pending = [...queueStore.pendingMessages];
    if (pending.length === 0) return;

    for (const item of pending) {
      try {
        const outcome = await parseMessageWithAi(item.body);
        if (outcome) {
          const result = outcome.result;
          const wallet = useWalletStore
            .getState()
            .wallets.find((w) => w.id === item.walletId);

          if (wallet) {
            if ((!result.amount || result.amount === 0) && result.newBalance !== undefined) {
              const delta = result.newBalance - wallet.balance;
              if (delta !== 0) {
                result.amount = Math.abs(delta);
                result.direction = delta > 0 ? 'credit' : 'debit';
              }
            }

            const newBalance =
              result.newBalance ??
              (result.direction === 'credit'
                ? wallet.balance + result.amount
                : wallet.balance - result.amount);

            useWalletStore.getState().updateBalance(wallet.id, newBalance);

            if (result.amount > 0) {
              recordTransaction({
                walletId: wallet.id,
                walletName: wallet.displayName,
                amount: result.amount,
                direction: result.direction,
                balanceAfter: newBalance,
                source: item.source === 'sms' ? 'ai_sms' : 'ai_notification',
              });
              void notifyTransaction({
                walletName: wallet.displayName,
                amount: result.amount,
                direction: result.direction,
                balanceAfter: newBalance,
                aiProvider: AI_PROVIDER_LABELS[outcome.provider],
              });
            }

            const user = useAuthStore.getState().user;
            if (user) void pushBalanceUpdate(wallet.id, newBalance);
          }
        }
        queueStore.dequeueMessage(item.id);
      } catch {
        break;
      }
    }
  } finally {
    isProcessingQueue = false;
  }
}
