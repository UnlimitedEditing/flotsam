package app.flotsam.client

import android.content.Context
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.Worker
import androidx.work.WorkerParameters
import java.util.concurrent.TimeUnit
import okhttp3.Request

/**
 * Checks the renders the app started but has not seen finish (about every 15 minutes, the platform minimum),
 * and posts a generic notification when one is ready. Runs only after the user passed the age gate, only while
 * there is something to watch, and never reads or shows any content: it asks "has media appeared?" and no more.
 * Not instant: Android may delay it (Doze, battery savers).
 */
class RenderCheckWorker(context: Context, params: WorkerParameters) : Worker(context, params) {
    override fun doWork(): Result {
        val ctx = applicationContext
        val store = SecureStore.get(ctx)
        if (!store.consent) return Result.success()
        // When the app is on screen it already shows results; leave the list for it to reconcile.
        if (AppState.foreground) return Result.success()
        val key = store.apiKey() ?: return Result.success()

        val now = System.currentTimeMillis()
        val live = store.updatePending { PendingJobs.expire(it, now) }
        if (live.isEmpty()) {
            Scheduler.cancel(ctx)
            return Result.success()
        }

        val base = Http.apiBase
        for (job in live) {
            val request = Request.Builder()
                .url("${base}render/${job.renderHash}/")
                .header("Accept", "application/vnd.api+json")
                .header("Authorization", "Bearer $key")
                .build()
            val (status, body) = try {
                Http.shortClient.newCall(request).execute().use { it.code to (it.body?.string() ?: "") }
            } catch (e: Exception) {
                continue // offline or transient: try again next time
            }
            when (PendingJobs.verdict(status, RenderStatus.hasMedia(body))) {
                PendingJobs.Verdict.NOTIFY_DONE -> {
                    Notifier.show(ctx, job.jobId, ok = true, discreet = store.discreet)
                    store.updatePending { PendingJobs.remove(it, job.jobId) }
                }
                PendingJobs.Verdict.DROP -> store.updatePending { PendingJobs.remove(it, job.jobId) }
                PendingJobs.Verdict.KEEP -> Unit
            }
        }
        if (store.pending().isEmpty()) Scheduler.cancel(ctx)
        return Result.success()
    }
}

object Scheduler {
    private const val WORK = "render-check"

    /** Starts the periodic check when there is something to watch; stops it when there is not. */
    fun sync(context: Context, hasPending: Boolean) {
        if (hasPending) {
            val req = PeriodicWorkRequestBuilder<RenderCheckWorker>(15, TimeUnit.MINUTES)
                .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
                .build()
            WorkManager.getInstance(context).enqueueUniquePeriodicWork(WORK, ExistingPeriodicWorkPolicy.KEEP, req)
        } else {
            cancel(context)
        }
    }

    fun cancel(context: Context) {
        WorkManager.getInstance(context).cancelUniqueWork(WORK)
    }
}
