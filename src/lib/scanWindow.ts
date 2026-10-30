/**
 * Pure scheduling/de-duplication rules for the catch-up scanner.
 *
 * Kept free of React Native and native-module imports so the decisions that
 * determine whether a transaction is applied once, twice, or not at all can be
 * exercised directly.
 *
 * The model:
 *  - Every scan reads the whole catch-up window (7–90 days). There is no
 *    forward-only cursor: a cursor can be pushed past real messages by an SMS
 *    with a wrong timestamp, or skip a message the network delivered late.
 *  - A message from a tracked sender is identified by a content fingerprint
 *    and remembered once judged, so reading it again never re-applies it.
 *  - Each wallet has an anchor: the moment its balance was last known to be
 *    exact (created, set by hand, or stated in a message). Anything before
 *    the anchor is already part of the balance and is never applied.
 */

export const DAY_MS = 24 * 60 * 60 * 1000;

// Widest catch-up window the settings offer.
export const MAX_WINDOW_DAYS = 90;

// Judged-message records must outlive the widest window, or a message could
// fall out of the record while still inside the window and be applied again.
export const PROCESSED_RETENTION_MS = (MAX_WINDOW_DAYS + 7) * DAY_MS;

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
 * Canonical form of an SMS sender for comparison.
 *
 * Alphanumeric ids ("MEEZAN", "Jazz Cash") compare case- and space-blind.
 * Long numeric senders compare on their last 10 digits, so "+92 300 1234567"
 * and "03001234567" are the same sender; short codes ("8558") stay as-is.
 */
export function normalizeSender(sender: string): string {
  const s = sender.replace(/[\s+\-().]/g, '').toLowerCase();
  if (/^\d{10,}$/.test(s)) return s.slice(-10);
  return s;
}

/** A wallet's sender ids, normalized. Accepts comma/semicolon/newline lists. */
export function parseSenderList(raw: string | undefined | null): string[] {
  if (!raw) return [];
  return raw
    .split(/[,;\n]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map(normalizeSender);
}

/** 32-bit FNV-1a, hex. Enough to fingerprint a message body. */
export function hashText(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}

/**
 * Identity of an inbox SMS. Built from content rather than the inbox row id,
 * because row ids change when an SMS app restores a backup — content doesn't.
 */
export function smsKey(msg: { sender: string; date: number; body: string }): string {
  return `s:${msg.date}:${normalizeSender(msg.sender)}:${hashText(msg.body)}`;
}

export function notificationKey(id: string): string {
  return `n:${id}`;
}

/**
 * Identity of a notification's *content*. Wallet apps update a notification
 * in place, which arrives as a fresh capture with the same text; this key
 * lets the re-post be recognised even when it lands in a later scan.
 */
export function notificationContentKey(n: Pick<NotificationLike, 'packageName' | 'title' | 'text'>): string {
  return `c:${n.packageName}:${hashText(`${n.title}\n${n.text}`)}`;
}

/**
 * True when a message at `at` is already part of a balance anchored at
 * `anchor`. Strictly before: a different message in the same millisecond as
 * the one that set the anchor is still news (the anchoring message itself is
 * caught by its key).
 */
export function isReflectedInBalance(at: number, anchor: number): boolean {
  return at < anchor;
}

/** A position in the inbox, ordered by (date, row id). */
export interface InboxCursor {
  date: number;
  id: number;
}

export interface PagePlan {
  /** Rows not yet seen in this scan, in the order given. */
  fresh: SmsRow[];
  /** Where the next page starts: the last row of this one. */
  next: InboxCursor;
  /** True when there is no point issuing another read. */
  done: boolean;
}

/**
 * Decides what to do with one page of inbox rows (read oldest first, ordered
 * by date then row id, starting after `cursor`).
 *
 * A short page means the inbox is exhausted. The other checks only matter if
 * a provider ignores the requested ordering: a page with nothing new, or one
 * that doesn't move the cursor, would otherwise be re-read forever.
 */
export function planPage(
  rows: SmsRow[],
  seenInScan: Set<string>,
  pageSize: number,
  cursor: InboxCursor
): PagePlan {
  const fresh = rows.filter((row) => !seenInScan.has(row.id));
  const last = rows[rows.length - 1];
  const next = last ? { date: last.date, id: Number(last.id) } : cursor;
  const stuck = next.date === cursor.date && next.id === cursor.id;

  return {
    fresh,
    next,
    done: rows.length < pageSize || fresh.length === 0 || stuck,
  };
}

export interface NotificationPlan {
  /** Entries to judge, oldest first. */
  toConsider: NotificationLike[];
  /** Re-posts of an entry in this same batch — ack without applying. */
  collapsedIds: string[];
}

/**
 * Filters the captured-notification queue down to the window and collapses
 * re-posts within this batch. Entries older than the window are left out of
 * both lists, so they stay queued and a wider window can still reach them.
 */
export function planNotifications(
  pending: NotificationLike[],
  windowStart: number,
  dedupWindowMs: number
): NotificationPlan {
  const inWindow = pending
    .filter((n) => n.timestamp >= windowStart)
    .sort((a, b) => a.timestamp - b.timestamp);

  const toConsider: NotificationLike[] = [];
  const collapsedIds: string[] = [];
  const lastSeenByContent = new Map<string, number>();

  for (const entry of inWindow) {
    const key = notificationContentKey(entry);
    const previous = lastSeenByContent.get(key);
    if (previous !== undefined && entry.timestamp - previous < dedupWindowMs) {
      collapsedIds.push(entry.id);
      continue;
    }
    lastSeenByContent.set(key, entry.timestamp);
    toConsider.push(entry);
  }

  return { toConsider, collapsedIds };
}

/**
 * True when `contentSeenAt` (from an earlier scan) marks `timestamp` as a
 * re-post of something already judged.
 */
export function isRepost(timestamp: number, contentSeenAt: number | undefined, dedupWindowMs: number): boolean {
  return contentSeenAt !== undefined && Math.abs(timestamp - contentSeenAt) < dedupWindowMs;
}

/** Drops judged-message records too old to matter any more. */
export function pruneProcessed(processed: Record<string, number>, now: number): Record<string, number> {
  const cutoff = now - PROCESSED_RETENTION_MS;
  const next: Record<string, number> = {};
  for (const [key, at] of Object.entries(processed)) {
    if (at >= cutoff) next[key] = at;
  }
  return next;
}
