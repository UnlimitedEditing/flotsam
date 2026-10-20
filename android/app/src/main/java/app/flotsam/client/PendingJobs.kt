package app.flotsam.client

import org.json.JSONArray
import org.json.JSONObject

/** A render the background worker should watch: its job id (for the deep link) and Graydient's render hash. */
data class PendingJob(val jobId: String, val renderHash: String, val startedAt: Long)

object PendingJobs {
    /** Jobs older than this are dropped instead of being watched forever. */
    const val MAX_AGE_MS = 6L * 60 * 60 * 1000

    fun toJson(list: List<PendingJob>): String {
        val arr = JSONArray()
        for (j in list) {
            arr.put(
                JSONObject()
                    .put("jobId", j.jobId)
                    .put("renderHash", j.renderHash)
                    .put("startedAt", j.startedAt),
            )
        }
        return arr.toString()
    }

    fun fromJson(text: String?): List<PendingJob> {
        if (text.isNullOrEmpty()) return emptyList()
        return try {
            val arr = JSONArray(text)
            (0 until arr.length()).mapNotNull { i ->
                val o = arr.optJSONObject(i) ?: return@mapNotNull null
                val id = o.optString("jobId", "")
                val hash = o.optString("renderHash", "")
                if (id.isEmpty() || hash.isEmpty()) null else PendingJob(id, hash, o.optLong("startedAt", 0L))
            }
        } catch (e: Exception) {
            emptyList()
        }
    }

    /** Adds (or refreshes) a job; one entry per job id. */
    fun add(list: List<PendingJob>, job: PendingJob): List<PendingJob> =
        list.filter { it.jobId != job.jobId } + job

    fun remove(list: List<PendingJob>, jobId: String): List<PendingJob> = list.filter { it.jobId != jobId }

    fun expire(list: List<PendingJob>, now: Long): List<PendingJob> =
        list.filter { now - it.startedAt <= MAX_AGE_MS }

    /** What the worker should do with one job given the HTTP outcome of checking it. */
    enum class Verdict { NOTIFY_DONE, KEEP, DROP }

    fun verdict(httpStatus: Int, hasMedia: Boolean): Verdict = when {
        httpStatus in 200..299 && hasMedia -> Verdict.NOTIFY_DONE
        httpStatus == 404 || httpStatus == 410 -> Verdict.DROP // the render no longer exists
        else -> Verdict.KEEP // still running, or a transient error: look again next time
    }
}
