package app.flotsam.client

import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageInstaller
import android.net.Uri
import android.os.Build
import android.provider.Settings
import java.io.File
import java.io.IOException
import okhttp3.Request

class UpdateError(message: String) : Exception(message)

/**
 * Self-update for the sideloaded app: check version.json, download the APK, verify it, install it.
 *
 * Trust chain: HTTPS only, the APK from the same host as version.json, SHA-256 must match, the file's own
 * package name and versionCode are checked (no other app, no downgrade), and finally Android itself refuses an
 * update that is not signed with the same key as the installed app. The user confirms the install on screen.
 */
class AppUpdater(private val context: Context) {
    private val prefs = context.getSharedPreferences("flotsam_update", Context.MODE_PRIVATE)
    private val dir get() = File(context.cacheDir, "updates").apply { mkdirs() }

    val manifestUrl: String get() = BuildConfig.UPDATE_MANIFEST_URL
    val enabled: Boolean get() = manifestUrl.isNotEmpty() && UpdateUrlPolicy.isHttps(manifestUrl)

    data class Installed(val code: Int, val name: String)

    @Suppress("DEPRECATION")
    fun installed(): Installed {
        val info = context.packageManager.getPackageInfo(context.packageName, 0)
        val code = if (Build.VERSION.SDK_INT >= 28) info.longVersionCode.toInt() else info.versionCode
        return Installed(code, info.versionName ?: "")
    }

    fun lastCheck(): Long = prefs.getLong(KEY_LAST_CHECK, 0L)

    /** The last manifest we accepted, kept so a forced update still blocks while offline. */
    fun cachedManifest(): UpdateManifest? {
        val text = prefs.getString(KEY_MANIFEST, null) ?: return null
        return (UpdateManifestParser.parse(text) as? ManifestResult.Ok)?.manifest
    }

    fun decision(): UpdateDecision? = cachedManifest()?.let { UpdatePolicy.decide(installed().code, it) }

    /** Fetches version.json (blocking). On any problem the previous cache is kept and an error is thrown. */
    fun check() {
        if (!enabled) throw UpdateError("Updates are not set up in this build.")
        val request = Request.Builder().url(manifestUrl).header("Accept", "application/json").build()
        val body = try {
            Http.shortClient.newCall(request).execute().use { r ->
                if (!r.isSuccessful) throw UpdateError("The update service answered ${r.code}.")
                r.body?.string().orEmpty()
            }
        } catch (e: UpdateError) {
            throw e
        } catch (e: IOException) {
            throw UpdateError("Could not reach the update service.")
        }
        when (val parsed = UpdateManifestParser.parse(body)) {
            is ManifestResult.Invalid -> throw UpdateError("The update information is invalid (${parsed.reason}).")
            is ManifestResult.Ok -> {
                if (!UpdateUrlPolicy.sameOrigin(manifestUrl, parsed.manifest.apkUrl)) {
                    throw UpdateError("The update file is not on the update host, so it was ignored.")
                }
                prefs.edit().putString(KEY_MANIFEST, body).putLong(KEY_LAST_CHECK, System.currentTimeMillis()).apply()
            }
        }
    }

    /** Downloads and verifies the APK for the cached manifest (blocking). Returns the verified file. */
    fun download(onProgress: (done: Long, total: Long?) -> Unit): File {
        val m = cachedManifest() ?: throw UpdateError("No update to download. Check for updates first.")
        if (!UpdateUrlPolicy.sameOrigin(manifestUrl, m.apkUrl)) throw UpdateError("The update file is not on the update host.")
        purgeOldFiles(keep = m.versionCode)

        val part = File(dir, "update-${m.versionCode}.apk.part")
        val done = File(dir, "update-${m.versionCode}.apk")
        done.delete()

        var offset = UpdateDownload.resumeOffset(if (part.exists()) part.length() else 0L, m.size)
        if (offset == 0L) part.delete()

        val builder = Request.Builder().url(m.apkUrl)
        if (offset > 0) builder.header("Range", "bytes=$offset-")
        try {
            Http.client.newCall(builder.build()).execute().use { r ->
                if (!r.isSuccessful) throw UpdateError("The download failed (${r.code}).")
                if (offset > 0 && !UpdateDownload.canAppend(offset, r.code)) {
                    part.delete() // the server ignored the range: start over from the beginning
                    offset = 0
                }
                val total = r.body?.contentLength()?.takeIf { it > 0 }?.let { it + offset } ?: m.size
                var written = offset
                var lastReport = 0L
                java.io.FileOutputStream(part, offset > 0).use { out ->
                    r.body!!.byteStream().use { input ->
                        val buf = ByteArray(64 * 1024)
                        while (true) {
                            val n = input.read(buf)
                            if (n < 0) break
                            out.write(buf, 0, n)
                            written += n
                            val now = System.currentTimeMillis()
                            if (now - lastReport > 250) {
                                lastReport = now
                                onProgress(written, total)
                            }
                        }
                        out.fd.sync()
                    }
                }
                onProgress(written, total)
            }
        } catch (e: UpdateError) {
            throw e
        } catch (e: IOException) {
            throw UpdateError("The download was interrupted. Try again to resume.") // the partial file is kept
        }

        // Verify before anything else touches the file.
        if (m.size != null && part.length() != m.size) {
            part.delete()
            throw UpdateError("The downloaded file has the wrong size, so it was discarded.")
        }
        if (!Sha256.matches(m.sha256, Sha256.ofFile(part))) {
            part.delete()
            throw UpdateError("The downloaded file failed its integrity check (SHA-256), so it was discarded.")
        }
        if (!part.renameTo(done)) throw UpdateError("Could not save the update.")

        val info = context.packageManager.getPackageArchiveInfo(done.absolutePath, 0)
        @Suppress("DEPRECATION")
        val apkCode = info?.let { if (Build.VERSION.SDK_INT >= 28) it.longVersionCode.toInt() else it.versionCode }
        val verdict = ApkCheck.verify(context.packageName, installed().code, info?.packageName, apkCode, m.versionCode)
        if (verdict is ApkCheck.Verdict.Reject) {
            done.delete()
            throw UpdateError(verdict.reason)
        }
        return done
    }

    fun readyFile(): File? {
        val m = cachedManifest() ?: return null
        return File(dir, "update-${m.versionCode}.apk").takeIf { it.exists() }
    }

    fun canInstallUnknown(): Boolean = context.packageManager.canRequestPackageInstalls()

    fun unknownSourcesIntent(): Intent =
        Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:${context.packageName}"))
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)

    /** Hands the verified APK to PackageInstaller. The result arrives at UpdateReceiver. */
    fun install(apk: File) {
        val installer = context.packageManager.packageInstaller
        val params = PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL)
            .apply { setAppPackageName(context.packageName) }
        val id = installer.createSession(params)
        installer.openSession(id).use { session ->
            apk.inputStream().use { input ->
                session.openWrite("flotsam.apk", 0, apk.length()).use { out ->
                    input.copyTo(out)
                    session.fsync(out)
                }
            }
            val intent = Intent(context, UpdateReceiver::class.java).setAction(UpdateReceiver.ACTION)
            // Must be mutable: the system adds the install status to this intent.
            val pending = PendingIntent.getBroadcast(context, id, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE)
            session.commit(pending.intentSender)
        }
    }

    /** Once the app has caught up with the cached manifest, the downloaded files are no longer needed. */
    fun purgeStaleIfCurrent() {
        val m = cachedManifest() ?: return purgeOldFiles()
        if (installed().code >= m.versionCode) purgeOldFiles()
    }

    /** Removes downloads for other versions (and everything once the app has caught up). */
    fun purgeOldFiles(keep: Int? = null) {
        dir.listFiles()?.forEach { f ->
            if (keep == null || !f.name.startsWith("update-$keep.apk")) f.delete()
        }
    }

    companion object {
        private const val KEY_MANIFEST = "manifest"
        private const val KEY_LAST_CHECK = "lastCheck"
    }
}
