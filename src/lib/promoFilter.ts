// Distinguishes marketing copy from real transaction alerts. Promos borrow
// transaction vocabulary ("Rs.100 cashback", "load", "payein"), so keyword
// matching alone is not enough — we look at tense and evidence instead.

// Definitive, already-happened actions. A real alert always has one of these
// (or a stated balance); marketing copy almost never does.
const COMPLETED_TXN = [
  /\bdebited\b/i,
  /\bcredited\b/i,
  /\breceived\b/i,
  /\bwithdraw(?:n|al)\b/i,
  /\bdeposited\b/i,
  /\bsent\b/i,
  /\bspent\b/i,
  /\bcharged\b/i,
  /\bpaid\b/i,
  /\btransferred\b/i,
  /\bdeducted\b/i,
  /\bpurchased\b/i,
  /\badded\s+to\b/i,
  /\bcash\s*(?:in|out)\b/i,
  /\bpayment\s+(?:of|made|received)\b/i,
  /\bhas\s+been\s+(?:debited|credited|purchased|processed|deducted)\b/i,
];

// Future / conditional framing — the money has not moved yet.
const NOT_YET_HAPPENED = [
  /\bis\s+waiting\b/i,
  /\bwill\s+(?:be|get|receive|earn|win)\b/i,
  /\bwhen\s+you\b/i,
  /\bstand\s+a\s+chance\b/i,
  /\bup\s*to\b/i,
  /\bavail\b/i,
  /\bstarting\s+(?:from|at)\b/i,
];

// Reward-bait and calls to action, including Roman-Urdu imperatives that only
// ever appear in Pakistani marketing messages.
const MARKETING = [
  /\bcashback\b/i,
  /\bdiscount\b/i,
  /\d+%\s*off\b/i,
  /\bfree\b/i,
  /\bmuft\b/i,
  /\bwin\b/i,
  /\bprize\b/i,
  /\blucky\b/i,
  /\bbonus\b/i,
  /\breward(?:s|ing)?\b/i,
  /\bt&c\b/i,
  /\bterms\b/i,
  /\bvalid\s+(?:till|until)\b/i,
  /\blimited\s+time\b/i,
  /\bhurry\b/i,
  /\bsubscribe\b/i,
  /\bdial\b/i,
  /\bclick\b/i,
  /\bdownload\b/i,
  /\bseamless\b/i,
  /\bexciting\b/i,
  /\baaj\s*hi\b/i,
  /\babhi\b/i,
  /\ble(?:in|ain)\b/i,
  /\bpay(?:ein|ain|en)\b/i,
  /\bkare(?:in|ain)\b/i,
  /\bkijiye\b/i,
  /\bhasil\b/i,
  /\bjeet\w*/i,
];

export function hasCompletedTransactionVerb(text: string): boolean {
  return COMPLETED_TXN.some((p) => p.test(text));
}

/**
 * True when the text reads as an advertisement rather than a transaction
 * receipt. Future-tense framing is rejected outright; reward-bait wording is
 * rejected unless the message also states a completed action.
 */
export function looksPromotional(text: string): boolean {
  if (!text) return false;
  if (NOT_YET_HAPPENED.some((p) => p.test(text))) return true;
  if (MARKETING.some((p) => p.test(text))) return !hasCompletedTransactionVerb(text);
  return false;
}
