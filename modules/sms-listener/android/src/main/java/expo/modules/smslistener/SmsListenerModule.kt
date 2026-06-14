package expo.modules.smslistener

import android.Manifest
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.provider.Telephony
import androidx.core.content.ContextCompat
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class SmsListenerModule : Module() {
  private var receiver: SmsBroadcastReceiver? = null

  override fun definition() = ModuleDefinition {
    Name("SmsListener")

    Events("onSmsReceived")

    // Check if SMS permissions are granted
    AsyncFunction("checkPermission") {
      val context = appContext.reactContext ?: return@AsyncFunction false
      val receiveSms = ContextCompat.checkSelfPermission(
        context, Manifest.permission.RECEIVE_SMS
      ) == PackageManager.PERMISSION_GRANTED
      val readSms = ContextCompat.checkSelfPermission(
        context, Manifest.permission.READ_SMS
      ) == PackageManager.PERMISSION_GRANTED
      receiveSms && readSms
    }

    // Request SMS permissions
    AsyncFunction("requestPermission") {
      val activity = appContext.currentActivity
        ?: return@AsyncFunction false

      val permissions = arrayOf(
        Manifest.permission.RECEIVE_SMS,
        Manifest.permission.READ_SMS
      )

      // Check if already granted
      val allGranted = permissions.all {
        ContextCompat.checkSelfPermission(activity, it) == PackageManager.PERMISSION_GRANTED
      }
      if (allGranted) return@AsyncFunction true

      // Request permissions
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
        activity.requestPermissions(permissions, SMS_PERMISSION_REQUEST_CODE)
      }

      // Note: The actual result comes async. For simplicity, we re-check after a delay.
      // In practice, the user will need to grant and then the next check will reflect it.
      false
    }

    // Register the broadcast receiver
    Function("startListening") {
      val context = appContext.reactContext ?: return@Function
      if (receiver != null) return@Function // Already listening

      receiver = SmsBroadcastReceiver { sender, body, timestamp ->
        sendEvent("onSmsReceived", mapOf(
          "sender" to sender,
          "body" to body,
          "timestamp" to timestamp
        ))
      }

      val filter = IntentFilter(Telephony.Sms.Intents.SMS_RECEIVED_ACTION)
      filter.priority = 999
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        context.registerReceiver(receiver, filter, Context.RECEIVER_EXPORTED)
      } else {
        context.registerReceiver(receiver, filter)
      }
    }

    // Unregister the broadcast receiver
    Function("stopListening") {
      val context = appContext.reactContext ?: return@Function
      receiver?.let {
        try {
          context.unregisterReceiver(it)
        } catch (_: Exception) {}
        receiver = null
      }
    }

    OnDestroy {
      val context = appContext.reactContext ?: return@OnDestroy
      receiver?.let {
        try {
          context.unregisterReceiver(it)
        } catch (_: Exception) {}
        receiver = null
      }
    }
  }

  companion object {
    private const val SMS_PERMISSION_REQUEST_CODE = 1001
  }
}

/**
 * BroadcastReceiver that listens for incoming SMS and forwards them.
 */
class SmsBroadcastReceiver(
  private val onSmsReceived: (sender: String, body: String, timestamp: Long) -> Unit
) : BroadcastReceiver() {
  override fun onReceive(context: Context?, intent: Intent?) {
    if (intent?.action != Telephony.Sms.Intents.SMS_RECEIVED_ACTION) return

    val messages = Telephony.Sms.Intents.getMessagesFromIntent(intent)
    if (messages.isNullOrEmpty()) return

    // Group multi-part SMS by sender
    val grouped = mutableMapOf<String, StringBuilder>()
    var timestamp = System.currentTimeMillis()

    for (msg in messages) {
      val sender = msg.originatingAddress ?: "unknown"
      val body = msg.messageBody ?: ""
      timestamp = msg.timestampMillis

      grouped.getOrPut(sender) { StringBuilder() }.append(body)
    }

    for ((sender, body) in grouped) {
      onSmsReceived(sender, body.toString(), timestamp)
    }
  }
}
