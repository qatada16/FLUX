package expo.modules.notificationlistener

import android.content.ComponentName
import android.content.Intent
import android.provider.Settings
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class NotificationListenerModule : Module() {

  override fun definition() = ModuleDefinition {
    Name("NotificationListener")

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

    // The packages worth capturing. The service drops everything else on
    // arrival, so this must be kept in step with the user's wallets.
    Function("setWatchedPackages") { packages: List<String> ->
      val context = appContext.reactContext ?: return@Function
      NotificationBuffer.setWatchedPackages(context, packages)
    }

    // Notifications captured while the app was closed, oldest first.
    AsyncFunction("getPending") {
      val context = appContext.reactContext
        ?: return@AsyncFunction emptyList<Map<String, Any>>()
      NotificationBuffer.getPending(context)
    }

    // Drop entries once JS has applied them. Kept separate from getPending so
    // a crash mid-apply leaves the queue intact for the next scan.
    AsyncFunction("ack") { ids: List<String> ->
      val context = appContext.reactContext ?: return@AsyncFunction false
      NotificationBuffer.ack(context, ids)
      true
    }

    AsyncFunction("clearPending") {
      val context = appContext.reactContext ?: return@AsyncFunction false
      NotificationBuffer.clear(context)
      true
    }
  }
}
