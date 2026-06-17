import type { ParserConfig, ParseResult } from './types';

// Helper: extract a number from a string like "Rs.1,234.56", "RS 1234", "rs500", "PKR 1234.56"
// Handles all case/spacing/dot combinations.
function extractAmount(text: string): number | null {
  // Match patterns like:
  //   Rs.1,234.56 | Rs 500 | RS500 | rs. 1234 | PKR 1234 | pkr 500.00
  const match = text.match(/(?:Rs\.?\s*|PKR\.?\s*)([\d,]+(?:\.\d{1,2})?)/i);
  if (!match) return null;
  const cleaned = match[1].replace(/,/g, '');
  const amount = parseFloat(cleaned);
  return isNaN(amount) || amount <= 0 ? null : amount;
}

// Generic parser that identifies credit/debit from common keywords.
// Primary logic: look for "sent" → debit, "received" → credit, plus
// other common banking keywords.
function genericParse(body: string): ParseResult | null {
  const amount = extractAmount(body);
  if (!amount) return null;

  // Skip non-transactional messages
  const skipPatterns = [
    /\botp\b/i, /\bverification\b/i, /\bpromo\b/i, /\boffer\b/i,
    /\bbalance\s+(?:is|inquiry|check)/i, /\bpin\b/i,
  ];
  if (skipPatterns.some((p) => p.test(body))) return null;

  // Credit indicators (money coming in)
  const creditPatterns = [
    /\breceived\b/i, /\bcredited\b/i, /\bcredit\b/i,
    /\bdeposit(?:ed)?\b/i, /\btransfer(?:red)?\s+to\s+your\b/i,
    /\bincoming\b/i, /\bcash\s*in\b/i,
  ];

  // Debit indicators (money going out)
  const debitPatterns = [
    /\bsent\b/i, /\bdebited\b/i, /\bdebit\b/i,
    /\bwithdra(?:wn?|wal)\b/i, /\bpaid\b/i, /\bpayment\b/i,
    /\btransfer(?:red)?\s+from\b/i, /\bcash\s*out\b/i,
    /\bpurchase\b/i,
  ];

  // Find earliest matching position for each direction
  const findEarliestMatch = (patterns: RegExp[]): number => {
    let earliest = Infinity;
    for (const p of patterns) {
      const m = body.search(p);
      if (m !== -1 && m < earliest) earliest = m;
    }
    return earliest;
  };

  const creditPos = findEarliestMatch(creditPatterns);
  const debitPos = findEarliestMatch(debitPatterns);

  const isCredit = creditPos < Infinity;
  const isDebit = debitPos < Infinity;

  // If neither matches, we can't classify
  if (!isCredit && !isDebit) return null;

  // If both match, use whichever keyword appeared first in the message
  if (isCredit && isDebit) {
    return { amount, direction: creditPos < debitPos ? 'credit' : 'debit' };
  }

  return { amount, direction: isCredit ? 'credit' : 'debit' };
}

// Provider-specific parsers. Each can override the generic parser
// with custom regex if needed. Add real SMS examples to refine these.

export const parserConfigs: ParserConfig[] = [
  {
    providerKey: 'jazzcash',
    patterns: [/received|sent|cash\s*in|cash\s*out|paid|payment/i],
    parse: genericParse,
  },
  {
    providerKey: 'easypaisa',
    patterns: [/received|sent|cash\s*in|cash\s*out|paid|transfer/i],
    parse: genericParse,
  },
  {
    providerKey: 'sadapay',
    patterns: [/received|sent|credited|debited/i],
    parse: genericParse,
  },
  {
    providerKey: 'nayapay',
    patterns: [/received|sent|credited|debited/i],
    parse: genericParse,
  },
  {
    providerKey: 'meezan',
    patterns: [/credited|debited|deposit|withdraw/i],
    parse: genericParse,
  },
  {
    providerKey: 'faysal',
    patterns: [/credited|debited|deposit|withdraw/i],
    parse: genericParse,
  },
  {
    providerKey: 'hbl',
    patterns: [/credited|debited|deposit|withdraw/i],
    parse: genericParse,
  },
  {
    providerKey: 'ubl',
    patterns: [/credited|debited|deposit|withdraw/i],
    parse: genericParse,
  },
  {
    providerKey: 'alfalah',
    patterns: [/credited|debited|deposit|withdraw/i],
    parse: genericParse,
  },
  {
    providerKey: 'mcb',
    patterns: [/credited|debited|deposit|withdraw/i],
    parse: genericParse,
  },
];

// Find parser config for a given provider
export function getParserForProvider(providerKey: string): ParserConfig | undefined {
  return parserConfigs.find((p) => p.providerKey === providerKey);
}
