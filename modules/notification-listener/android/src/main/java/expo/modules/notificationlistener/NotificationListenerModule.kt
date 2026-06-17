package expo.modules.notificationlistener

import android.content.ComponentName
import android.content.Intent
import android.provider.Settings
import android.text.TextUtils
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class NotificationListenerModule : Module() {

  override fun definition() = ModuleDefinition {
    Name("NotificationListener")

    Events("onNotificationReceived")

    // Check if notification listener access is enabled for this app
    AsyncFunction("checkPermission") {
      val context = appContext.reactContext ?: return@AsyncFunction false
      val packageName = context.packageName
      val flat = Settings.Secure.getString(
        context.contentResolver,
        "enabled_notification_listeners"
      )
      if (flat.isNullOrEmpty()) return@AsyncFunction false
      flat.split(":").any { component ->
        val cn = ComponentName.unflattenFromString(component)
        cn != null && cn.packageName == packageName
      }
    }

    // Open the Android Notification Access settings screen.
    // There's no popup for this — the user must toggle it manually.
    Function("openSettings") {
      val activity = appContext.currentActivity
      if (activity != null) {
        val intent = Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS)
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        activity.startActivity(intent)
      }
    }

    // Register the static callback so the service can forward events to JS
    Function("startListening") {
      FluxNotificationListenerService.onNotificationCallback = { packageName, title, text, timestamp ->
        sendEvent("onNotificationReceived", mapOf(
          "packageName" to packageName,
          "title" to title,
          "text" to text,
          "timestamp" to timestamp
        ))
      }
    }

    // Unregister the callback
    Function("stopListening") {
      FluxNotificationListenerService.onNotificationCallback = null
    }

    OnDestroy {
      FluxNotificationListenerService.onNotificationCallback = null
    }
  }
}
