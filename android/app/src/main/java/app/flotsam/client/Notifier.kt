package app.flotsam.client

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat

object Notifier {
    private const val CHANNEL = "renders"

    fun canNotify(context: Context): Boolean =
        Build.VERSION.SDK_INT < 33 ||
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) ==
            PackageManager.PERMISSION_GRANTED

    private fun ensureChannel(context: Context, discreet: Boolean) {
        val nm = context.getSystemService(NotificationManager::class.java)
        // The channel name shows in system settings, so it follows discreet mode too.
        nm.createNotificationChannel(
            NotificationChannel(CHANNEL, if (discreet) "Reminders" else "Render alerts", NotificationManager.IMPORTANCE_DEFAULT),
        )
    }

    /** Generic text only (see NotificationText). Tapping opens flotsam://job/<jobId>. */
    fun show(context: Context, jobId: String, ok: Boolean, discreet: Boolean) {
        if (!canNotify(context)) return
        ensureChannel(context, discreet)
        val text = NotificationText.choose(discreet, ok)
        val open = Intent(Intent.ACTION_VIEW, Uri.parse("flotsam://job/$jobId"), context, MainActivity::class.java)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
        val pending = PendingIntent.getActivity(
            context,
            jobId.hashCode(),
            open,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val n = NotificationCompat.Builder(context, CHANNEL)
            .setSmallIcon(R.drawable.ic_stat_notify)
            .setContentTitle(text.title)
            .setContentText(text.body)
            .setContentIntent(pending)
            .setAutoCancel(true)
            .setOnlyAlertOnce(true)
            .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
            .build()
        try {
            NotificationManagerCompat.from(context).notify(jobId.hashCode(), n)
        } catch (e: SecurityException) {
            // Permission revoked between the check and the call: nothing to show.
        }
    }
}
