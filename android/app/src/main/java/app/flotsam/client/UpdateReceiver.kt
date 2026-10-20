package app.flotsam.client

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageInstaller
import android.os.Build

/** Receives the result of the PackageInstaller session started by AppUpdater.install(). */
class UpdateReceiver : BroadcastReceiver() {
    @Suppress("DEPRECATION")
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != ACTION) return
        when (intent.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE)) {
            PackageInstaller.STATUS_PENDING_USER_ACTION -> {
                // Android needs the user to confirm the install; show its screen.
                val confirm = if (Build.VERSION.SDK_INT >= 33) {
                    intent.getParcelableExtra(Intent.EXTRA_INTENT, Intent::class.java)
                } else {
                    intent.getParcelableExtra(Intent.EXTRA_INTENT) as? Intent
                }
                confirm?.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)?.let { context.startActivity(it) }
            }
            PackageInstaller.STATUS_SUCCESS -> Unit // the app is being replaced; nothing more to do
            else -> FlotsamNativePlugin.reportUpdateFailure(
                messageFor(
                    intent.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE),
                    intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE),
                ),
            )
        }
    }

    companion object {
        const val ACTION = "app.flotsam.client.UPDATE_STATUS"

        fun messageFor(status: Int, detail: String?): String = when (status) {
            PackageInstaller.STATUS_FAILURE_ABORTED -> "The installation was cancelled."
            PackageInstaller.STATUS_FAILURE_BLOCKED -> "Android blocked the installation. Check your device settings."
            PackageInstaller.STATUS_FAILURE_CONFLICT -> "The update conflicts with the installed app."
            PackageInstaller.STATUS_FAILURE_INCOMPATIBLE ->
                "This update was signed with a different key than the installed app, so Android refused it. Uninstall the app and install the new version fresh."
            PackageInstaller.STATUS_FAILURE_INVALID -> "Android rejected the update file as invalid."
            PackageInstaller.STATUS_FAILURE_STORAGE -> "There is not enough storage space to install the update."
            else -> "The installation failed${if (detail.isNullOrEmpty()) "." else ": $detail"}"
        }
    }
}
