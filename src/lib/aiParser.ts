import type { ParseResult } from './parsers/types';
import { useAiQueueStore } from '../store/aiQueueStore';
import { useWalletStore } from '../store/walletStore';
import { useAuthStore } from '../store/authStore';
import { pushBalanceUpdate } from './sync';
import { recordTransaction } from './transactionSync';

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

function getEnv(key: string): string {
  return process.env[`EXPO_PUBLIC_${key}`] || process.env[key] || '';
}

async function callCerebras(text: string): Promise<string> {
  const key = getEnv('CEREBRAS_API_KEY');
  if (!key) throw new Error('Missing Cerebras key');

  const res = await fetch('https://api.cerebras.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: 'llama3.1-8b',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: text },
      ],
      temperature: 0,
      max_tokens: 150,
    }),
  });

  if (!res.ok) throw new Error(`Cerebras error: ${res.status}`);
  const data = await res.json();
  return data?.choices?.[0]?.message?.content || '';
}

async function callMistral(text: string): Promise<string> {
  const key = getEnv('MISTRAL_API_KEY');
  if (!key) throw new Error('Missing Mistral key');

  const res = await fetch('https://api.mistral.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: 'mistral-small-latest',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: text },
      ],
      temperature: 0,
      max_tokens: 150,
    }),
  });

  if (!res.ok) throw new Error(`Mistral error: ${res.status}`);
  const data = await res.json();
  return data?.choices?.[0]?.message?.content || '';
}

async function callGemini(text: string): Promise<string> {
  const key = getEnv('GEMINI_API_KEY');
  if (!key) throw new Error('Missing Gemini key');

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

async function callGroq(text: string): Promise<string> {
  const key = getEnv('GROQ_API_KEY');
  if (!key) throw new Error('Missing Groq key');

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: 'llama-3.1-8b-instant',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: text },
      ],
      temperature: 0,
      max_tokens: 150,
    }),
  });

  if (!res.ok) throw new Error(`Groq error: ${res.status}`);
  const data = await res.json();
  return data?.choices?.[0]?.message?.content || '';
}

function parseAiJsonResponse(rawText: string): ParseResult | null {
  if (!rawText) return null;

  try {
    const cleaned = rawText
      .replace(/```json/gi, '')
      .replace(/```/g, '')
      .trim();

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
      if (!isNaN(num) && num >= 0) {
        newBalance = num;
      }
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

export async function parseMessageWithAi(text: string): Promise<ParseResult | null> {
  const providers = [
    { name: 'Cerebras', fn: callCerebras },
    { name: 'Mistral', fn: callMistral },
    { name: 'Gemini', fn: callGemini },
    { name: 'Groq', fn: callGroq },
  ];

  for (const p of providers) {
    try {
      const raw = await p.fn(text);
      const result = parseAiJsonResponse(raw);
      if (result) return result;
    } catch {
      // Continue to next AI provider on error
    }
  }

  return null;
}

let isProcessingQueue = false;

export async function processPendingAiQueue(): Promise<void> {
  if (isProcessingQueue) return;
  isProcessingQueue = true;

  try {
    const queueStore = useAiQueueStore.getState();
    const pending = [...queueStore.pendingMessages];
    if (pending.length === 0) return;

    for (const item of pending) {
      try {
        let result = await parseMessageWithAi(item.body);
        if (result) {
          const wallet = useWalletStore
            .getState()
            .wallets.find((w) => w.id === item.walletId);

          if (wallet) {
            // Infer amount & direction from balance delta if AI only detected New_Amount
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
            }

            const user = useAuthStore.getState().user;
            if (user) {
              void pushBalanceUpdate(wallet.id, newBalance);
            }
          }
          queueStore.dequeueMessage(item.id);
        } else {
          queueStore.dequeueMessage(item.id);
        }
      } catch {
        break;
      }
    }
  } finally {
    isProcessingQueue = false;
  }
}
