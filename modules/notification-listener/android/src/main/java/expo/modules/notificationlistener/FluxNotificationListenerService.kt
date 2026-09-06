package expo.modules.notificationlistener

import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification

/**
 * Captures notifications from the wallet apps the user is tracking and parks
 * them in [NotificationBuffer] for the next catch-up scan to apply.
 *
 * Android binds this service itself once the user grants notification access,
 * so there is no foreground service, no wake lock and no JS runtime involved.
 * It does the least possible work per notification: ignore anything from a
 * package JS is not watching, then append the text to a bounded queue.
 */
class FluxNotificationListenerService : NotificationListenerService() {

  override fun onNotificationPosted(sbn: StatusBarNotification?) {
    capture(sbn)
  }

  /**
   * Sweeps notifications still sitting in the shade. Runs when the OS binds
   * the service -- notably right after the user grants access, which recovers
   * alerts posted before Flux could see anything.
   */
  override fun onListenerConnected() {
    val active = try {
      activeNotifications
    } catch (e: Exception) {
      null
    } ?: return
    for (sbn in active) capture(sbn)
  }

  private fun capture(sbn: StatusBarNotification?) {
    sbn ?: return
    val context = applicationContext ?: return
    val packageName = sbn.packageName ?: return

    // Every notification on the device reaches this service, so discard the
    // ones we don't track before doing any further work.
    if (!NotificationBuffer.isWatched(context, packageName)) return

    val extras = sbn.notification?.extras ?: return
    val title = extras.getCharSequence("android.title")?.toString() ?: ""
    val text = extras.getCharSequence("android.text")?.toString() ?: ""
    if (title.isBlank() && text.isBlank()) return

    try {
      NotificationBuffer.add(context, packageName, title, text, sbn.postTime)
    } catch (e: Exception) {
      // Never let a storage hiccup crash a system-bound service.
    }
  }
}
