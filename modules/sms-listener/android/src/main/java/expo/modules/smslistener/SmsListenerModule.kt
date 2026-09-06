package expo.modules.smslistener

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
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
 * (and once a day via WorkManager). That keeps the app entirely asleep in
 * between and avoids RECEIVE_SMS altogether.
 */
class SmsListenerModule : Module() {

  override fun definition() = ModuleDefinition {
    Name("SmsListener")

    AsyncFunction("checkPermission") {
      val context = appContext.reactContext ?: return@AsyncFunction false
      ContextCompat.checkSelfPermission(
        context, Manifest.permission.READ_SMS
      ) == PackageManager.PERMISSION_GRANTED
    }

    AsyncFunction("requestPermission") {
      val activity = appContext.currentActivity ?: return@AsyncFunction false

      val granted = ContextCompat.checkSelfPermission(
        activity, Manifest.permission.READ_SMS
      ) == PackageManager.PERMISSION_GRANTED
      if (granted) return@AsyncFunction true

      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
        activity.requestPermissions(
          arrayOf(Manifest.permission.READ_SMS), SMS_PERMISSION_REQUEST_CODE
        )
      }
      // The grant result arrives asynchronously; the caller re-checks.
      false
    }

    /**
     * Inbox messages with date >= `since` (epoch ms), oldest first, at most
     * `limit` rows. Oldest-first plus a caller-advanced cursor lets a wide
     * window be walked in pages instead of returning thousands of rows.
     */
    AsyncFunction("readMessages") { since: Double, limit: Int ->
      val context = appContext.reactContext
        ?: return@AsyncFunction emptyList<Map<String, Any>>()
      val hasRead = ContextCompat.checkSelfPermission(
        context, Manifest.permission.READ_SMS
      ) == PackageManager.PERMISSION_GRANTED
      if (!hasRead) return@AsyncFunction emptyList<Map<String, Any>>()

      val cappedLimit = limit.coerceIn(1, MAX_ROWS_PER_READ)
      val results = mutableListOf<Map<String, Any>>()
      val projection = arrayOf(
        Telephony.Sms._ID,
        Telephony.Sms.ADDRESS,
        Telephony.Sms.BODY,
        Telephony.Sms.DATE
      )
      val selection = "${Telephony.Sms.DATE} >= ?"
      val selectionArgs = arrayOf(since.toLong().toString())
      // SQLite-backed provider honours a trailing LIMIT in the sort order arg.
      val sortOrder = "${Telephony.Sms.DATE} ASC LIMIT $cappedLimit"

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
  }

  companion object {
    private const val SMS_PERMISSION_REQUEST_CODE = 1001
    // Hard ceiling on one page, so a 90-day window can't blow up the bridge.
    private const val MAX_ROWS_PER_READ = 500
  }
}
