import {
  checkSmsPermission,
  readMessages,
  isAvailable as smsAvailable,
} from '../../modules/sms-listener';
import {
  getPendingNotifications,
  ackNotifications,
  clearPendingNotifications,
  setWatchedPackages,
  isAvailable as notificationsAvailable,
} from '../../modules/notification-listener';
import { useWalletStore } from '../store/walletStore';
import { useReconcileStore } from '../store/reconcileStore';
import { useSettingsStore, AUTO_SCAN_INTERVAL_MS } from '../store/settingsStore';
import { useAuthStore } from '../store/authStore';
import { applySmsToWallets } from './smsHandler';
import { applyNotificationToWallets } from './notificationHandler';
import { processPendingAiQueue } from './aiParser';
import { flushPendingSync } from './sync';
import { ensureStoresHydrated } from './hydrate';
import { DAY_MS, computeSmsStart, planPage, planNotifications } from './scanWindow';

// Rows per inbox read. A wide window is walked in pages rather than pulled
// across the bridge in one go.
const SMS_PAGE_SIZE = 200;
// Safety valve on the paging loop.
const MAX_SMS_PAGES = 25;

// Two notifications with identical text this close together are the same
// alert re-posted (wallet apps update an existing notification in place).
const NOTIFICATION_DEDUP_WINDOW_MS = 5 * 60 * 1000;

export type ScanTrigger = 'launch' | 'foreground' | 'manual' | 'auto';

export type ScanSkipReason =
  | 'unavailable' // not Android / native modules missing
  | 'busy' // a scan is already running
  | 'baseline' // first run: cursor established, history deliberately not replayed
  | 'no-wallets' // nothing configured for automatic tracking
  | 'no-permission'; // neither SMS nor notification access granted

export interface ScanResult {
  windowDays: number;
  smsScanned: number;
  smsApplied: number;
  notificationsScanned: number;
  notificationsApplied: number;
  skipped?: ScanSkipReason;
}

const emptyResult = (windowDays: number, skipped?: ScanSkipReason): ScanResult => ({
  windowDays,
  smsScanned: 0,
  smsApplied: 0,
  notificationsScanned: 0,
  notificationsApplied: 0,
  skipped,
});

let scanning = false;

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
  const packages = useWalletStore
    .getState()
    .wallets.filter((w) => w.trackingMethod === 'notification' && !!w.notificationPackage)
    .map((w) => w.notificationPackage as string);
  setWatchedPackages(Array.from(new Set(packages)));
}

/** Whether an unattended scan is due (used by the daily background task). */
export function isAutoScanDue(now = Date.now()): boolean {
  const { lastScanAt } = useSettingsStore.getState();
  return now - lastScanAt >= AUTO_SCAN_INTERVAL_MS;
}

/**
 * Reads everything that arrived while the app was closed and applies it.
 *
 * Nothing listens in the background: transaction SMS sit in the system inbox
 * and wallet-app notifications sit in a native capture queue, and both are
 * drained here — when the app is opened, pulled to refresh, or once a day by
 * WorkManager.
 *
 * The window is a *ceiling*, not a replay instruction. Applied messages are
 * remembered, and the SMS cursor only moves forward, so widening the window
 * never re-applies anything — it only lets a longer absence be caught up.
 */
export async function runCatchUpScan(trigger: ScanTrigger): Promise<ScanResult> {
  if (!smsAvailable && !notificationsAvailable) {
    return emptyResult(useSettingsStore.getState().refreshWindowDays, 'unavailable');
  }
  if (scanning) {
    return emptyResult(useSettingsStore.getState().refreshWindowDays, 'busy');
  }

  scanning = true;
  try {
    // The daily task can start before the stores have loaded; reading them
    // early would look like a first run and reset the baseline.
    await ensureStoresHydrated();

    const windowDays = useSettingsStore.getState().refreshWindowDays;
    syncWatchedPackages();

    const wallets = useWalletStore.getState().wallets;
    const hasSmsWallet = wallets.some((w) => w.trackingMethod === 'sms' && !!w.smsSender);
    const hasNotificationWallet = wallets.some(
      (w) => w.trackingMethod === 'notification' && !!w.notificationPackage
    );
    if (!hasSmsWallet && !hasNotificationWallet) {
      return emptyResult(windowDays, 'no-wallets');
    }

    const smsGranted = hasSmsWallet && (await checkSmsPermission());
    if (!smsGranted && !hasNotificationWallet) {
      return emptyResult(windowDays, 'no-permission');
    }

    const now = Date.now();
    const windowStart = now - windowDays * DAY_MS;

    // First run establishes the baseline instead of replaying history — the
    // balance set during onboarding already accounts for past transactions.
    if (!useReconcileStore.getState().initialized) {
      useReconcileStore.getState().initCursor(now);
      await clearPendingNotifications();
      useSettingsStore.getState().recordScan(now);
      return emptyResult(windowDays, 'baseline');
    }

    // Unattended scans post an alert per transaction; when the user is in the
    // app the screen itself is the feedback, so stay quiet.
    const notify = trigger === 'auto';

    const sms = smsGranted
      ? await scanSms(windowDays, now, notify)
      : { scanned: 0, applied: 0 };
    const notifications = hasNotificationWallet
      ? await scanNotifications(windowStart, notify)
      : { scanned: 0, applied: 0 };

    await processPendingAiQueue();

    const user = useAuthStore.getState().user;
    if (user && (sms.applied > 0 || notifications.applied > 0)) {
      await flushPendingSync(user.id);
    }

    useSettingsStore.getState().recordScan(Date.now());

    return {
      windowDays,
      smsScanned: sms.scanned,
      smsApplied: sms.applied,
      notificationsScanned: notifications.scanned,
      notificationsApplied: notifications.applied,
    };
  } catch (err) {
    console.error('[Scan] failed:', err);
    return emptyResult(useSettingsStore.getState().refreshWindowDays);
  } finally {
    scanning = false;
  }
}

/**
 * Walks the SMS inbox from the later of the window start and the stored
 * cursor, in pages, applying anything not already applied.
 */
async function scanSms(
  windowDays: number,
  now: number,
  notify: boolean
): Promise<{ scanned: number; applied: number }> {
  const cursor = useReconcileStore.getState().smsCursor;
  let since = computeSmsStart(now, windowDays, cursor);

  const seen = new Set(useReconcileStore.getState().processedSmsIds);
  let scanned = 0;
  let applied = 0;

  for (let page = 0; page < MAX_SMS_PAGES; page++) {
    const messages = await readMessages(since, SMS_PAGE_SIZE);
    if (messages.length === 0) break;

    const plan = planPage(messages, seen, SMS_PAGE_SIZE, since);
    const handledIds: string[] = [];

    for (const row of plan.fresh) {
      const msg = messages.find((m) => m.id === row.id);
      if (!msg) continue;
      seen.add(msg.id);
      scanned++;
      // Recorded either way: a message already judged must never be
      // reconsidered, or a promo could be re-parsed on a later scan.
      handledIds.push(msg.id);
      if (await applySmsToWallets(msg, { notify })) applied++;
    }

    useReconcileStore.getState().commitSms(plan.maxDate, handledIds);

    if (plan.done) break;
    since = plan.maxDate;
  }

  return { scanned, applied };
}

/**
 * Drains the native notification queue. Entries are acked only after they are
 * applied, so a scan interrupted midway leaves the rest for the next attempt.
 * Entries older than the current window are left queued — widening the window
 * later can still pick them up.
 */
async function scanNotifications(
  windowStart: number,
  notify: boolean
): Promise<{ scanned: number; applied: number }> {
  const pending = await getPendingNotifications();
  if (pending.length === 0) return { scanned: 0, applied: 0 };

  const plan = planNotifications(
    pending,
    windowStart,
    useReconcileStore.getState().processedNotificationIds,
    NOTIFICATION_DEDUP_WINDOW_MS
  );

  let applied = 0;
  for (const entry of plan.toApply) {
    if (await applyNotificationToWallets(entry, { notify })) applied++;
  }

  if (plan.handledIds.length > 0) {
    useReconcileStore.getState().commitNotifications(plan.handledIds);
    await ackNotifications(plan.handledIds);
  }

  return { scanned: plan.handledIds.length, applied };
}
