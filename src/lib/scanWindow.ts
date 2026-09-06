/**
 * Pure scheduling/de-duplication rules for the catch-up scanner.
 *
 * Kept free of React Native and native-module imports so the decisions that
 * determine whether a transaction is applied once, twice, or not at all can be
 * exercised directly.
 */

export const DAY_MS = 24 * 60 * 60 * 1000;

export interface SmsRow {
  id: string;
  date: number;
}

export interface NotificationLike {
  id: string;
  packageName: string;
  title: string;
  text: string;
  timestamp: number;
}

/**
 * Where an inbox scan should start reading.
 *
 * The window is a ceiling, not a replay instruction: reading never begins
 * before the stored cursor, so widening the window cannot re-apply anything
 * already accounted for. It only helps when the cursor is older than the
 * window — i.e. the app hasn't been opened in a while.
 */
export function computeSmsStart(now: number, windowDays: number, smsCursor: number): number {
  const windowStart = now - windowDays * DAY_MS;
  return Math.max(windowStart, smsCursor);
}

export interface PagePlan {
  /** Rows not previously applied, in the order given. */
  fresh: SmsRow[];
  /** Newest date seen in this page; the cursor never moves back past it. */
  maxDate: number;
  /** True when there is no point issuing another read. */
  done: boolean;
}

/**
 * Decides what to do with one page of inbox rows.
 *
 * `done` guards the two ways paging can end: a short page means the inbox is
 * exhausted, and a page with nothing new means the cursor cannot advance —
 * which happens when more rows than a page share a single timestamp. Without
 * that second check the same page would be re-read forever.
 */
export function planPage(rows: SmsRow[], seen: Set<string>, pageSize: number, since: number): PagePlan {
  const fresh: SmsRow[] = [];
  let maxDate = since;

  for (const row of rows) {
    if (row.date > maxDate) maxDate = row.date;
    if (seen.has(row.id)) continue;
    fresh.push(row);
  }

  return {
    fresh,
    maxDate,
    done: rows.length < pageSize || fresh.length === 0,
  };
}

export interface NotificationPlan {
  /** Entries to hand to the parser, oldest first. */
  toApply: NotificationLike[];
  /**
   * Every entry considered — including ones dropped as duplicates. These are
   * recorded and acked so they are never reconsidered; entries outside the
   * window are deliberately absent so a wider window can still reach them.
   */
  handledIds: string[];
}

/**
 * Filters the captured-notification queue down to what should be applied.
 *
 * Drops anything older than the window or already applied, then collapses
 * re-posts: wallet apps update a notification in place, which arrives as a
 * fresh capture with the same text, and must not count as a second payment.
 */
export function planNotifications(
  pending: NotificationLike[],
  windowStart: number,
  processedIds: Iterable<string>,
  dedupWindowMs: number
): NotificationPlan {
  const processed = new Set(processedIds);

  const inWindow = pending
    .filter((n) => n.timestamp >= windowStart && !processed.has(n.id))
    .sort((a, b) => a.timestamp - b.timestamp);

  const toApply: NotificationLike[] = [];
  const handledIds: string[] = [];
  const lastSeenByContent = new Map<string, number>();

  for (const entry of inWindow) {
    handledIds.push(entry.id);

    const key = `${entry.packageName}|${entry.title}|${entry.text}`;
    const previous = lastSeenByContent.get(key);
    if (previous !== undefined && entry.timestamp - previous < dedupWindowMs) {
      continue;
    }
    lastSeenByContent.set(key, entry.timestamp);
    toApply.push(entry);
  }

  return { toApply, handledIds };
}
