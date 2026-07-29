// Gate before spending an AI call: a message can only be a transaction if it
// contains a number that could plausibly be an amount. Promo/marketing text
// with no figures is dropped for free.

// Strip things that look like numbers but never are amounts, so "Dial *345#"
// or "valid till 31-12-2025" alone don't trigger an AI call.
const NOISE = [
  /\b(?:\+?92|0)3\d{2}[\s-]?\d{7}\b/g,        // PK mobile numbers
  /\b\d{1,2}[-/]\d{1,2}[-/]\d{2,4}\b/g,       // dates
  /\b\d{1,2}:\d{2}(?::\d{2})?\s*(?:am|pm)?\b/gi, // times
  /\*\d+[#*]?/g,                               // USSD codes (*345#)
  /\bhttps?:\/\/\S+/gi,                        // urls
  /\b\d{1,3}%/g,                               // percentages
];

const AMOUNT = /\d/;

/**
 * True if the text still holds a number after removing non-amount noise.
 * Used to decide whether a message is worth sending to an AI provider.
 */
export function containsPossibleAmount(text: string): boolean {
  if (!text) return false;
  let cleaned = text;
  for (const re of NOISE) cleaned = cleaned.replace(re, ' ');
  return AMOUNT.test(cleaned);
}
