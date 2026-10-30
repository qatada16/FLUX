import { watchInbox } from '../../modules/sms-listener';
import { onNotificationCaptured } from '../../modules/notification-listener';
import { runCatchUpScan } from './scanner';

// SMS apps write a message in several steps, and wallet apps often post a
// notification then update it; one scan after things settle covers them all.
const DEBOUNCE_MS = 1500;

let timer: ReturnType<typeof setTimeout> | null = null;
let stopInbox: (() => void) | null = null;
let stopNotifications: (() => void) | null = null;

function scheduleScan(): void {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    void runCatchUpScan('live');
  }, DEBOUNCE_MS);
}

/**
 * While the app process is alive (open, or recently backgrounded), apply new
 * transaction SMS and wallet notifications as they arrive instead of waiting
 * for the next open or background check. Nothing here keeps the process
 * alive — when Android reclaims it, the inbox scan and capture queue take over.
 *
 * Idempotent. Call again after SMS access is granted, since the inbox watch
 * can only start once READ_SMS is held.
 */
export function startLiveWatch(): void {
  if (!stopInbox) stopInbox = watchInbox(scheduleScan);
  if (!stopNotifications) stopNotifications = onNotificationCaptured(scheduleScan);
}

export function stopLiveWatch(): void {
  stopInbox?.();
  stopInbox = null;
  stopNotifications?.();
  stopNotifications = null;
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
}
