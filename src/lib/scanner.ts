import {
  checkSmsPermission,
  readMessages,
  isAvailable as smsAvailable,
} from '../../modules/sms-listener';
import {
  getPendingNotifications,
  ackNotifications,
  checkNotificationPermission,
  setWatchedPackages,
  isAvailable as notificationsAvailable,
} from '../../modules/notification-listener';
import type { Wallet } from '../types/wallet';
import { useWalletStore } from '../store/walletStore';
import { useReconcileStore } from '../store/reconcileStore';
import { useSettingsStore } from '../store/settingsStore';
import { useAuthStore } from '../store/authStore';
import { useTransactionStore } from '../store/transactionStore';
import { applyMessageToWallet, processPendingAiQueue, type ApplyOutcome, type MessageSource } from './messageHandler';
import { notifyTransactions, type TransactionNotice } from './notify';
import { flushPendingSync } from './sync';
import { ensureStoresHydrated } from './hydrate';
import {
  DAY_MS,
  type InboxCursor,
  isReflectedInBalance,
  isRepost,
  normalizeSender,
  notificationContentKey,
  notificationKey,
  parseSenderList,
  planNotifications,
  planPage,
  smsKey,
} from './scanWindow';

// Rows per inbox read. A wide window is walked in pages rather than pulled
// across the bridge in one go.
const SMS_PAGE_SIZE = 300;
// Safety valve on the paging loop (18k rows — a 90-day window on a busy phone).
const MAX_SMS_PAGES = 60;

// Two notifications with identical text this close together are the same
// alert re-posted (wallet apps update an existing notification in place).
const NOTIFICATION_DEDUP_WINDOW_MS = 5 * 60 * 1000;

// A scan prompted by a new SMS or notification while the app is running looks
// back this far instead of the whole window: enough to catch a message the
// network delivered late, cheap enough to run on every inbox change.
const LIVE_LOOKBACK_MS = 2 * DAY_MS;

// Network steps inside a scan must not hold it open indefinitely.
const AUTH_TIMEOUT_MS = 5000;
const SYNC_TIMEOUT_MS = 10_000;

export type ScanTrigger =
  | 'launch' // app opened
  | 'foreground' // app brought back
  | 'manual' // pull-to-refresh / Check Now
  | 'auto' // background task
  | 'live'; // the app saw a new SMS/notification arrive

export type ScanSkipReason =
  | 'unavailable' // not Android / native modules missing
  | 'no-wallets' // nothing configured for automatic tracking
  | 'no-permission'; // SMS wallets only, and SMS access isn't granted

export interface WalletScanStats {
  walletId: string;
  walletName: string;
  found: number;
  applied: number;
}

export interface ScanResult {
  windowDays: number;
  /** Messages from tracked senders / wallet apps inside the window. */
  found: number;
  /** Balance updates this scan made. */
  applied: number;
  /** Seen before, or already part of the balance the wallet started from. */
  alreadyCounted: number;
  /** Not a transaction (OTP, promo, balance enquiry…). */
  ignored: number;
  /** Waiting for an AI provider to become reachable. */
  queued: number;
  /** There are SMS wallets but READ_SMS isn't granted. */
  smsPermissionMissing: boolean;
  /** There are notification wallets but notification access isn't granted. */
  notificationAccessMissing: boolean;
  perWallet: WalletScanStats[];
  skipped?: ScanSkipReason;
  error?: string;
}

const emptyResult = (windowDays: number, extra: Partial<ScanResult> = {}): ScanResult => ({
  windowDays,
  found: 0,
  applied: 0,
  alreadyCounted: 0,
  ignored: 0,
  queued: 0,
  smsPermissionMissing: false,
  notificationAccessMissing: false,
  perWallet: [],
  ...extra,
});

// A message from a tracked sender, ready to be judged.
interface Candidate {
  key: string;
  // Notifications only: identifies a re-post of the same alert.
  contentKey?: string;
  source: MessageSource;
  body: string;
  at: number;
  wallets: Wallet[];
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | undefined> {
  return Promise.race([promise, new Promise<undefined>((resolve) => setTimeout(resolve, ms))]);
}

const smsWalletsOf = (wallets: Wallet[]) =>
  wallets.filter((w) => w.trackingMethod === 'sms' && parseSenderList(w.smsSender).length > 0);

const notificationWalletsOf = (wallets: Wallet[]) =>
  wallets.filter((w) => w.trackingMethod === 'notification' && !!w.notificationPackage);

let lastWatchedSignature: string | null = null;

/**
 * Tell the native listener which packages to capture. The service drops
 * everything else on arrival, so this must run whenever wallets change.
 */
export function syncWatchedPackages(): void {
  if (!notificationsAvailable) return;
  // Before the wallet store loads there are no wallets to report, and writing
  // an empty list would make the service discard everything until the next
  // scan. Hydration notifies subscribers, so this runs again in a moment.
  if (!useWalletStore.persist.hasHydrated()) return;
  const packages = Array.from(
    new Set(notificationWalletsOf(useWalletStore.getState().wallets).map((w) => w.notificationPackage as string))
  ).sort();
  // Called on every wallet-store change (balances included); only write when
  // the list actually changed — the native side commits to disk each time.
  const signature = packages.join('|');
  if (signature === lastWatchedSignature) return;
  lastWatchedSignature = signature;
  setWatchedPackages(packages);
}

let inFlight: Promise<ScanResult> | null = null;
let rerunTrigger: ScanTrigger | null = null;

/**
 * Reads every SMS and captured wallet notification in the catch-up window and
 * applies the transactions the balances don't include yet.
 *
 * Runs when the app opens or returns to the foreground, on pull-to-refresh
 * and Check Now, from the periodic background task, and — while the app
 * process is alive — whenever a new SMS or wallet notification arrives.
 *
 * Safe to call as often as you like: a message is applied at most once (see
 * scanWindow.ts), and a call made while a scan is running joins it and
 * triggers one more pass, so nothing that arrived mid-scan is missed.
 */
export function runCatchUpScan(trigger: ScanTrigger): Promise<ScanResult> {
  if (!smsAvailable && !notificationsAvailable) {
    return Promise.resolve(
      emptyResult(useSettingsStore.getState().refreshWindowDays, { skipped: 'unavailable' })
    );
  }

  if (inFlight) {
    // A full-window request outranks a quick live look-back.
    rerunTrigger = rerunTrigger && rerunTrigger !== 'live' ? rerunTrigger : trigger;
    return inFlight;
  }

  inFlight = (async () => {
    try {
      let result = await scanOnce(trigger);
      while (rerunTrigger) {
        const next = rerunTrigger;
        rerunTrigger = null;
        result = mergeResults(result, await scanOnce(next));
      }
      return result;
    } catch (err) {
      console.error('[Scan] failed:', err);
      return emptyResult(useSettingsStore.getState().refreshWindowDays, {
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      inFlight = null;
      rerunTrigger = null;
    }
  })();
  return inFlight;
}

async function scanOnce(trigger: ScanTrigger): Promise<ScanResult> {
  // Headless runs start cold: wait for persisted state, and restore the
  // session so AI keys and cloud sync are available to the background task.
  await ensureStoresHydrated();
  await withTimeout(useAuthStore.getState().initialize(), AUTH_TIMEOUT_MS);

  const windowDays = useSettingsStore.getState().refreshWindowDays;
  syncWatchedPackages();

  const wallets = useWalletStore.getState().wallets;
  const smsWallets = smsWalletsOf(wallets);
  const notificationWallets = notificationWalletsOf(wallets);
  if (smsWallets.length === 0 && notificationWallets.length === 0) {
    return emptyResult(windowDays, { skipped: 'no-wallets' });
  }

  const smsGranted = smsWallets.length > 0 && (await checkSmsPermission());
  const notificationGranted =
    notificationWallets.length > 0 && (await checkNotificationPermission());
  const access = {
    smsPermissionMissing: smsWallets.length > 0 && !smsGranted,
    notificationAccessMissing: notificationWallets.length > 0 && !notificationGranted,
  };
  // The capture queue is drained even when notification access has since been
  // revoked — what it already holds is still valid.
  if (!smsGranted && notificationWallets.length === 0) {
    return emptyResult(windowDays, { ...access, skipped: 'no-permission' });
  }

  const now = Date.now();
  const windowStart = now - windowDays * DAY_MS;
  const readFrom = trigger === 'live' ? Math.max(windowStart, now - LIVE_LOOKBACK_MS) : windowStart;

  assignMissingAnchors([...smsWallets, ...notificationWallets], now);

  const candidates: Candidate[] = [];
  if (smsGranted) candidates.push(...(await collectSms(readFrom, smsWallets)));
  let ackIds: string[] = [];
  if (notificationWallets.length > 0) {
    const collected = await collectNotifications(readFrom, notificationWallets);
    candidates.push(...collected.candidates);
    ackIds = collected.ackIds;
  }
  // A message stamped in the future (wrong clock on the sender's side) must
  // not drag a wallet's anchor ahead of real time — every genuine message
  // after it would then look "already included". Its key keeps the raw date.
  for (const c of candidates) c.at = Math.min(c.at, now);
  // Oldest first across both sources, so stated balances land in order.
  candidates.sort((a, b) => a.at - b.at);

  const result = emptyResult(windowDays, access);
  const perWallet = new Map<string, WalletScanStats>();
  const notices: TransactionNotice[] = [];

  const statsFor = (w: Wallet) => {
    let s = perWallet.get(w.id);
    if (!s) {
      s = { walletId: w.id, walletName: w.displayName, found: 0, applied: 0 };
      perWallet.set(w.id, s);
    }
    return s;
  };

  const tally = (outcome: ApplyOutcome, wallet?: Wallet) => {
    switch (outcome.kind) {
      case 'applied':
        result.applied++;
        if (wallet) statsFor(wallet).applied++;
        notices.push(outcome.notice);
        break;
      case 'reflected':
        result.alreadyCounted++;
        break;
      case 'ignored':
        result.ignored++;
        break;
      case 'queued':
        result.queued++;
        break;
    }
  };

  for (const c of candidates) {
    result.found++;
    for (const w of c.wallets) statsFor(w).found++;

    const { processed, anchors } = useReconcileStore.getState();
    if (processed[c.key] !== undefined) {
      result.alreadyCounted++;
      continue;
    }
    // Older than every matching wallet's balance. Anchors only move forward,
    // so this stays true on every future scan — no need to record it (which
    // keeps a first wide-window scan from writing hundreds of entries).
    if (c.wallets.every((w) => isReflectedInBalance(c.at, anchors[w.id] ?? 0))) {
      result.alreadyCounted++;
      continue;
    }
    if (c.contentKey && isRepost(c.at, processed[c.contentKey], NOTIFICATION_DEDUP_WINDOW_MS)) {
      useReconcileStore.getState().markProcessed({ [c.key]: c.at });
      result.alreadyCounted++;
      continue;
    }

    // Recorded before applying: if the app dies mid-apply, one missed update
    // is corrected by the next stated balance, whereas a double-applied one
    // would silently stay wrong.
    useReconcileStore.getState().markProcessed({
      [c.key]: c.at,
      ...(c.contentKey ? { [c.contentKey]: c.at } : {}),
    });

    for (const w of c.wallets) {
      tally(await applyMessageToWallet(w, { source: c.source, body: c.body, at: c.at }), w);
    }
  }

  // Captured entries are acked only now that they're recorded as judged.
  await ackNotifications(ackIds);

  for (const outcome of await processPendingAiQueue()) tally(outcome);

  useReconcileStore.getState().prune(now);
  useSettingsStore.getState().recordScan(Date.now());
  result.perWallet = Array.from(perWallet.values());

  await notifyTransactions(notices);

  const user = useAuthStore.getState().user;
  if (user && result.applied > 0) {
    await withTimeout(flushPendingSync(user.id), SYNC_TIMEOUT_MS);
  }

  return result;
}

/**
 * Gives every tracked wallet an anchor. Normally set when the wallet is
 * created; wallets that predate anchors (an upgrade) or arrived from the
 * cloud get one here.
 */
function assignMissingAnchors(wallets: Wallet[], now: number): void {
  const { legacyAnchor } = useReconcileStore.getState();
  const transactions = useTransactionStore.getState().transactions;
  useReconcileStore.getState().ensureAnchors(
    wallets.map((w) => w.id),
    (walletId) => {
      if (legacyAnchor === null) return now;
      // Upgraded install: the old cursor marks what was already judged. A
      // balance typed in by hand since then is newer still.
      const lastManual = transactions.find((t) => t.walletId === walletId && t.source === 'manual');
      const manualAt = lastManual ? new Date(lastManual.createdAt).getTime() : 0;
      return Math.max(legacyAnchor, manualAt);
    }
  );
}

/** Inbox messages in the window from any tracked sender, oldest first. */
async function collectSms(readFrom: number, smsWallets: Wallet[]): Promise<Candidate[]> {
  const walletsBySender = new Map<string, Wallet[]>();
  for (const w of smsWallets) {
    for (const sender of parseSenderList(w.smsSender)) {
      const list = walletsBySender.get(sender) ?? [];
      if (!list.includes(w)) list.push(w);
      walletsBySender.set(sender, list);
    }
  }

  const candidates: Candidate[] = [];
  const seenInScan = new Set<string>();
  // afterId -1: start at readFrom inclusive.
  let cursor: InboxCursor = { date: readFrom, id: -1 };

  for (let page = 0; page < MAX_SMS_PAGES; page++) {
    const messages = await readMessages(cursor.date, cursor.id, SMS_PAGE_SIZE);
    if (messages.length === 0) break;

    const plan = planPage(messages, seenInScan, SMS_PAGE_SIZE, cursor);
    const fresh = new Set(plan.fresh.map((r) => r.id));
    for (const msg of messages) {
      if (!fresh.has(msg.id)) continue;
      seenInScan.add(msg.id);
      const wallets = walletsBySender.get(normalizeSender(msg.sender));
      if (!wallets) continue;
      candidates.push({ key: smsKey(msg), source: 'sms', body: msg.body, at: msg.date, wallets });
    }

    if (plan.done) break;
    cursor = plan.next;
  }

  return candidates;
}

/**
 * Captured wallet-app notifications in the window. Also returns the queue
 * entries to ack once judged: everything considered, re-posts collapsed in
 * this batch, and captures for apps no longer tracked.
 */
async function collectNotifications(
  readFrom: number,
  notificationWallets: Wallet[]
): Promise<{ candidates: Candidate[]; ackIds: string[] }> {
  const pending = await getPendingNotifications();
  if (pending.length === 0) return { candidates: [], ackIds: [] };

  const plan = planNotifications(pending, readFrom, NOTIFICATION_DEDUP_WINDOW_MS);
  const candidates: Candidate[] = [];
  const ackIds = [...plan.collapsedIds];

  for (const entry of plan.toConsider) {
    ackIds.push(entry.id);
    const wallets = notificationWallets.filter((w) => w.notificationPackage === entry.packageName);
    if (wallets.length === 0) continue;
    candidates.push({
      key: notificationKey(entry.id),
      contentKey: notificationContentKey(entry),
      source: 'notification',
      body: [entry.title, entry.text].filter(Boolean).join(' '),
      at: entry.timestamp,
      wallets,
    });
  }

  return { candidates, ackIds };
}

function mergeResults(a: ScanResult, b: ScanResult): ScanResult {
  const perWallet = new Map<string, WalletScanStats>();
  for (const s of [...a.perWallet, ...b.perWallet]) {
    const prev = perWallet.get(s.walletId);
    perWallet.set(
      s.walletId,
      prev ? { ...prev, found: Math.max(prev.found, s.found), applied: prev.applied + s.applied } : { ...s }
    );
  }
  return {
    ...b,
    windowDays: Math.max(a.windowDays, b.windowDays),
    // The second pass re-reads what the first found; count those once.
    found: Math.max(a.found, b.found),
    applied: a.applied + b.applied,
    alreadyCounted: Math.max(a.alreadyCounted, b.alreadyCounted - a.applied - a.ignored - a.queued),
    ignored: a.ignored + b.ignored,
    queued: a.queued + b.queued,
    perWallet: Array.from(perWallet.values()),
    skipped: a.skipped && b.skipped ? b.skipped : undefined,
  };
}
