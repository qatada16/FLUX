package expo.modules.notificationlistener

import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification

/**
 * Android NotificationListenerService that forwards posted notifications
 * to the Expo module via a static callback.
 *
 * The user must manually enable this service in Android Settings →
 * Notification Access. There is no runtime permission popup for this.
 */
class FluxNotificationListenerService : NotificationListenerService() {

  override fun onNotificationPosted(sbn: StatusBarNotification?) {
    sbn ?: return

    val packageName = sbn.packageName ?: return
    val extras = sbn.notification?.extras ?: return
    val title = extras.getCharSequence("android.title")?.toString() ?: ""
    val text = extras.getCharSequence("android.text")?.toString() ?: ""

    // Skip empty notifications
    if (text.isBlank() && title.isBlank()) return

    // Forward to the module via static callback
    onNotificationCallback?.invoke(packageName, title, text, sbn.postTime)
  }

  companion object {
    /**
     * Static callback set by the Expo module to receive notifications.
     * This is the bridge between the service (which Android manages)
     * and the module (which has access to JS events).
     */
    var onNotificationCallback: ((packageName: String, title: String, text: String, timestamp: Long) -> Unit)? = null
  }
}
