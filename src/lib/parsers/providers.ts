import type { ParserConfig, ParseResult } from './types';

// Currency tokens we recognise. Banks/wallets in PK use "Rs", "Rs.", "RS",
// "PKR", and occasionally "Rs/-" or "PKR." — all case-insensitive.
const CURRENCY = '(?:Rs\\.?\\/?-?|PKR\\.?)';
const NUM = '(\\d[\\d,]*(?:\\.\\d{1,2})?)';

// Currency can appear BEFORE the number ("Rs.1,234.56", "PKR 500") or
// AFTER it ("1,234.56 PKR", "500 Rs"). We try both, then fall back to a
// number that sits right after a transaction verb/preposition.
const CURRENCY_PREFIX = new RegExp(`${CURRENCY}\\s*${NUM}`, 'i');
const CURRENCY_SUFFIX = new RegExp(`${NUM}\\s*${CURRENCY}`, 'i');
// e.g. "purchase of 1,234.56", "debited for 500", "amount 1234"
const AMOUNT_NEAR_KEYWORD = new RegExp(
  `(?:of|for|amount|amt|worth)\\s*:?\\s*${NUM}`,
  'i'
);

function toNumber(raw: string | undefined): number | null {
  if (!raw) return null;
  const amount = parseFloat(raw.replace(/,/g, ''));
  return isNaN(amount) || amount <= 0 ? null : amount;
}

// Helper: extract the transaction amount from a message body.
// Handles currency before/after the number, thousands separators, and
// decimals. The currency symbol is NOT required to be "Rs." — "PKR" or a
// bare amount near a keyword also work.
function extractAmount(text: string): number | null {
  return (
    toNumber(text.match(CURRENCY_PREFIX)?.[1]) ??
    toNumber(text.match(CURRENCY_SUFFIX)?.[1]) ??
    toNumber(text.match(AMOUNT_NEAR_KEYWORD)?.[1])
  );
}

// Generic parser that identifies credit/debit from common keywords.
// Primary logic: look for "sent" → debit, "received" → credit, plus
// other common banking keywords.
function genericParse(body: string): ParseResult | null {
  const amount = extractAmount(body);
  if (!amount) return null;

  // Skip non-transactional messages. NOTE: we deliberately do NOT skip on
  // "balance" alone — real transaction alerts almost always include an
  // "Available Balance is Rs.X" line. Pure balance-inquiry replies carry no
  // credit/debit verb and are dropped later by direction detection.
  const skipPatterns = [
    /\botp\b/i, /\bverification\b/i, /\bone[-\s]?time\s+password\b/i,
    /\bpromo\b/i, /\boffer\b/i, /\bpin\b/i,
  ];
  if (skipPatterns.some((p) => p.test(body))) return null;

  // Credit indicators (money coming in)
  const creditPatterns = [
    /\breceived\b/i, /\bcredited\b/i, /\bcredit\b/i,
    /\bdeposit(?:ed)?\b/i, /\btransfer(?:red)?\s+to\s+your\b/i,
    /\bincoming\b/i, /\bcash\s*in\b/i, /\badded\b/i,
    /\brefund(?:ed)?\b/i, /\binward\b/i,
  ];

  // Debit indicators (money going out)
  const debitPatterns = [
    /\bsent\b/i, /\bdebited\b/i, /\bdebit\b/i,
    /\bwithdra\w*/i, /\bpaid\b/i, /\bpayment\b/i,
    /\btransfer(?:red)?\s+from\b/i, /\bcash\s*out\b/i,
    /\bpurchase\b/i, /\bspent\b/i, /\bdebit\s*card\b/i,
    /\bpos\b/i, /\batm\b/i, /\bbill\s*payment\b/i, /\boutgoing\b/i,
    /\bcharged\b/i,
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
