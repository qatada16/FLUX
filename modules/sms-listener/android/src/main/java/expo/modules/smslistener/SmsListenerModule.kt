package expo.modules.smslistener

import android.Manifest
import android.content.pm.PackageManager
import android.database.ContentObserver
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.provider.Telephony
import androidx.core.content.ContextCompat
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Read-only access to the system SMS inbox.
 *
 * There is deliberately no broadcast receiver here. Transaction SMS land in
 * the system inbox whether or not this app is running, so balances are
 * recovered by scanning that inbox when the user opens or refreshes the app
 * (and periodically via WorkManager). That avoids RECEIVE_SMS altogether.
 *
 * While the app process happens to be alive, an inbox ContentObserver tells JS
 * that something changed so it can scan straight away. The observer costs
 * nothing when idle and dies with the process — it is a shortcut, not a
 * background service.
 *
 * Permission requests go through React Native's PermissionsAndroid, which
 * reports the user's answer; this module only checks.
 */
class SmsListenerModule : Module() {
  private var observer: ContentObserver? = null

  override fun definition() = ModuleDefinition {
    Name("SmsListener")

    Events("onInboxChanged")

    AsyncFunction("checkPermission") {
      val context = appContext.reactContext ?: return@AsyncFunction false
      hasReadSms(context)
    }

    /**
     * Inbox messages after the (date, _id) position given, oldest first, at
     * most `limit` rows. Pass the last row of one page to get the next; pass
     * afterId = -1 to start at `since` inclusive. Paging on the pair rather
     * than the date alone means rows sharing a timestamp are never skipped.
     */
    AsyncFunction("readMessages") { since: Double, afterId: Double, limit: Int ->
      val context = appContext.reactContext
        ?: return@AsyncFunction emptyList<Map<String, Any>>()
      if (!hasReadSms(context)) return@AsyncFunction emptyList<Map<String, Any>>()

      val cappedLimit = limit.coerceIn(1, MAX_ROWS_PER_READ)
      val results = mutableListOf<Map<String, Any>>()
      val projection = arrayOf(
        Telephony.Sms._ID,
        Telephony.Sms.ADDRESS,
        Telephony.Sms.BODY,
        Telephony.Sms.DATE
      )
      val date = Telephony.Sms.DATE
      val id = Telephony.Sms._ID
      val selection = "($date > ?) OR ($date = ? AND $id > ?)"
      val sinceArg = since.toLong().toString()
      val selectionArgs = arrayOf(sinceArg, sinceArg, afterId.toLong().toString())
      // SQLite-backed provider honours a trailing LIMIT in the sort order arg.
      val sortOrder = "$date ASC, $id ASC LIMIT $cappedLimit"

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

    /**
     * Start emitting onInboxChanged whenever the SMS store changes. Idempotent;
     * returns false when READ_SMS is missing (call again once it is granted).
     */
    Function("startWatching") {
      val context = appContext.reactContext ?: return@Function false
      if (observer != null) return@Function true
      if (!hasReadSms(context)) return@Function false

      val obs = object : ContentObserver(Handler(Looper.getMainLooper())) {
        override fun onChange(selfChange: Boolean) {
          onChange(selfChange, null)
        }

        override fun onChange(selfChange: Boolean, uri: Uri?) {
          sendEvent("onInboxChanged", mapOf<String, Any?>())
        }
      }
      try {
        context.contentResolver.registerContentObserver(
          Telephony.Sms.CONTENT_URI, true, obs
        )
        observer = obs
        true
      } catch (e: Exception) {
        false
      }
    }

    Function("stopWatching") {
      unregisterObserver()
    }

    OnDestroy {
      unregisterObserver()
    }
  }

  private fun hasReadSms(context: android.content.Context): Boolean =
    ContextCompat.checkSelfPermission(
      context, Manifest.permission.READ_SMS
    ) == PackageManager.PERMISSION_GRANTED

  private fun unregisterObserver() {
    val obs = observer ?: return
    observer = null
    try {
      appContext.reactContext?.contentResolver?.unregisterContentObserver(obs)
    } catch (_: Exception) {}
  }

  companion object {
    // Hard ceiling on one page, so a 90-day window can't blow up the bridge.
    private const val MAX_ROWS_PER_READ = 500
  }
}
