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

    // Read messages from the device SMS inbox newer than `since` (epoch ms).
    // This is the backbone of reconciliation: even if the live broadcast was
    // missed (app killed, phone off, internet off), the SMS still landed in
    // the system inbox and we can recover it here. Returns oldest-first so the
    // caller can apply deltas in chronological order. Capped to avoid huge reads.
    AsyncFunction("readMessagesSince") { since: Double ->
      val context = appContext.reactContext ?: return@AsyncFunction emptyList<Map<String, Any>>()
      val hasRead = ContextCompat.checkSelfPermission(
        context, Manifest.permission.READ_SMS
      ) == PackageManager.PERMISSION_GRANTED
      if (!hasRead) return@AsyncFunction emptyList<Map<String, Any>>()

      val sinceMs = since.toLong()
      val results = mutableListOf<Map<String, Any>>()
      val projection = arrayOf(
        Telephony.Sms._ID,
        Telephony.Sms.ADDRESS,
        Telephony.Sms.BODY,
        Telephony.Sms.DATE
      )
      val selection = "${Telephony.Sms.DATE} >= ?"
      val selectionArgs = arrayOf(sinceMs.toString())
      // SQLite-backed provider honours a trailing LIMIT in the sort order arg.
      val sortOrder = "${Telephony.Sms.DATE} ASC LIMIT $MAX_RECONCILE_ROWS"

      context.contentResolver.query(
        Telephony.Sms.Inbox.CONTENT_URI, projection, selection, selectionArgs, sortOrder
      )?.use { cursor ->
        val idIdx = cursor.getColumnIndexOrThrow(Telephony.Sms._ID)
        val addrIdx = cursor.getColumnIndexOrThrow(Telephony.Sms.ADDRESS)
        val bodyIdx = cursor.getColumnIndexOrThrow(Telephony.Sms.BODY)
        val dateIdx = cursor.getColumnIndexOrThrow(Telephony.Sms.DATE)
        while (cursor.moveToNext()) {
          results.add(mapOf(
            "id" to cursor.getLong(idIdx).toString(),
            "sender" to (cursor.getString(addrIdx) ?: "unknown"),
            "body" to (cursor.getString(bodyIdx) ?: ""),
            "date" to cursor.getLong(dateIdx).toDouble()
          ))
        }
      }
      results
    }

    // Register the broadcast receiver
    Function("startListening") {
      val context = appContext.reactContext
      // Only register if we have a context and aren't already listening
      if (context != null && receiver == null) {
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
    }

    // Unregister the broadcast receiver
    Function("stopListening") {
      val context = appContext.reactContext
      if (context != null) {
        receiver?.let {
          try {
            context.unregisterReceiver(it)
          } catch (_: Exception) {}
          receiver = null
        }
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
    // Upper bound on rows returned by a single reconciliation read.
    private const val MAX_RECONCILE_ROWS = 200
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
