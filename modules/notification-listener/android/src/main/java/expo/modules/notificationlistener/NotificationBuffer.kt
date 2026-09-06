package expo.modules.notificationlistener

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

/**
 * A small persistent queue of captured notifications, shared between the
 * listener service (writer) and the Expo module (reader).
 *
 * Android keeps no queryable notification history, so anything not captured
 * as it is posted is gone forever. The listener service is bound by the OS --
 * it needs no foreground service and no JS runtime -- so it appends matching
 * notifications here and JS drains them on the next catch-up scan.
 *
 * Entry ids are content-derived rather than sequential, so capturing the same
 * notification twice (e.g. an active-shade sweep after a live capture) yields
 * the same id and the reader can discard the duplicate.
 */
object NotificationBuffer {
  private const val PREFS = "flux_notification_buffer"
  private const val KEY_QUEUE = "queue"
  private const val KEY_WATCHED = "watched_packages"

  // Bounded so a chatty package can't grow this without limit.
  private const val MAX_ENTRIES = 300

  // Nothing older than the widest catch-up window is worth keeping.
  private const val MAX_AGE_MS = 90L * 24 * 60 * 60 * 1000

  private val lock = Any()

  private fun prefs(context: Context) =
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  fun entryId(pkg: String, postTime: Long, title: String, text: String): String {
    val digest = (title + " " + text).hashCode()
    return pkg + "|" + postTime + "|" + digest
  }

  /** Packages JS is actually tracking. Anything else is dropped on arrival. */
  fun setWatchedPackages(context: Context, packages: List<String>) {
    synchronized(lock) {
      prefs(context).edit()
        .putString(KEY_WATCHED, JSONArray(packages).toString())
        .commit()
    }
  }

  fun isWatched(context: Context, pkg: String): Boolean {
    val raw = prefs(context).getString(KEY_WATCHED, null) ?: return false
    return try {
      val arr = JSONArray(raw)
      (0 until arr.length()).any { arr.optString(it) == pkg }
    } catch (e: Exception) {
      false
    }
  }

  fun add(context: Context, pkg: String, title: String, text: String, postTime: Long) {
    synchronized(lock) {
      val p = prefs(context)
      val arr = readQueue(p.getString(KEY_QUEUE, null))
      val id = entryId(pkg, postTime, title, text)

      // Already queued -- a re-post, or a shade sweep of a live capture.
      for (i in 0 until arr.length()) {
        if (arr.optJSONObject(i)?.optString("id") == id) return
      }

      val entry = JSONObject()
      entry.put("id", id)
      entry.put("packageName", pkg)
      entry.put("title", title)
      entry.put("text", text)
      entry.put("timestamp", postTime)
      arr.put(entry)

      p.edit().putString(KEY_QUEUE, prune(arr).toString()).commit()
    }
  }

  fun getPending(context: Context): List<Map<String, Any>> {
    synchronized(lock) {
      val arr = prune(readQueue(prefs(context).getString(KEY_QUEUE, null)))
      return (0 until arr.length()).mapNotNull { i ->
        val o = arr.optJSONObject(i)
        if (o == null) {
          null
        } else {
          mapOf(
            "id" to o.optString("id"),
            "packageName" to o.optString("packageName"),
            "title" to o.optString("title"),
            "text" to o.optString("text"),
            "timestamp" to o.optLong("timestamp").toDouble()
          )
        }
      }
    }
  }

  /** Drop entries the reader has finished applying. */
  fun ack(context: Context, ids: List<String>) {
    if (ids.isEmpty()) return
    synchronized(lock) {
      val p = prefs(context)
      val arr = readQueue(p.getString(KEY_QUEUE, null))
      val keep = JSONArray()
      for (i in 0 until arr.length()) {
        val o = arr.optJSONObject(i) ?: continue
        if (!ids.contains(o.optString("id"))) keep.put(o)
      }
      p.edit().putString(KEY_QUEUE, keep.toString()).commit()
    }
  }

  fun clear(context: Context) {
    synchronized(lock) {
      prefs(context).edit().remove(KEY_QUEUE).commit()
    }
  }

  private fun readQueue(raw: String?): JSONArray {
    if (raw.isNullOrEmpty()) return JSONArray()
    return try {
      JSONArray(raw)
    } catch (e: Exception) {
      JSONArray()
    }
  }

  /** Drops anything past the age limit, then trims oldest-first to the cap. */
  private fun prune(arr: JSONArray): JSONArray {
    val cutoff = System.currentTimeMillis() - MAX_AGE_MS
    val fresh = JSONArray()
    for (i in 0 until arr.length()) {
      val o = arr.optJSONObject(i) ?: continue
      if (o.optLong("timestamp") >= cutoff) fresh.put(o)
    }
    if (fresh.length() <= MAX_ENTRIES) return fresh
    val trimmed = JSONArray()
    for (i in (fresh.length() - MAX_ENTRIES) until fresh.length()) {
      trimmed.put(fresh.optJSONObject(i))
    }
    return trimmed
  }
}
