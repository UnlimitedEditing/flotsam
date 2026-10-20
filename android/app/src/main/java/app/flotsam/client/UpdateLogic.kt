package app.flotsam.client

import java.io.File
import java.net.URI
import java.security.MessageDigest
import org.json.JSONObject

/** What version.json says about the newest release. */
data class UpdateManifest(
    val versionCode: Int,
    val versionName: String,
    val minSupportedVersionCode: Int,
    val apkUrl: String,
    val sha256: String,
    val size: Long?,
    val notes: String,
)

sealed class ManifestResult {
    data class Ok(val manifest: UpdateManifest) : ManifestResult()
    data class Invalid(val reason: String) : ManifestResult()
}

object UpdateManifestParser {
    private val hex64 = Regex("^[0-9a-fA-F]{64}$")
    private const val MAX_NOTES = 2000

    /** Parses and strictly validates version.json. Anything doubtful is rejected, never guessed at. */
    fun parse(text: String): ManifestResult {
        val o = try {
            JSONObject(text)
        } catch (e: Exception) {
            return ManifestResult.Invalid("not valid JSON")
        }
        val code = o.optInt("versionCode", 0)
        if (code < 1) return ManifestResult.Invalid("versionCode missing or invalid")
        val name = o.optString("versionName", "")
        if (name.isEmpty() || name.length > 40) return ManifestResult.Invalid("versionName missing or invalid")
        val min = if (o.has("minSupportedVersionCode")) o.optInt("minSupportedVersionCode", 0) else 1
        if (min < 1 || min > code) return ManifestResult.Invalid("minSupportedVersionCode out of range")
        val url = o.optString("apkUrl", "")
        if (!UpdateUrlPolicy.isHttps(url)) return ManifestResult.Invalid("apkUrl must be https")
        val sha = o.optString("sha256", "")
        if (!hex64.matches(sha)) return ManifestResult.Invalid("sha256 must be 64 hex characters")
        val size = if (o.has("size")) o.optLong("size", 0L) else null
        if (size != null && size <= 0L) return ManifestResult.Invalid("size must be positive")
        return ManifestResult.Ok(
            UpdateManifest(code, name, min, url, sha.lowercase(), size, o.optString("notes", "").take(MAX_NOTES)),
        )
    }
}

enum class UpdateDecision { UP_TO_DATE, AVAILABLE, FORCED }

object UpdatePolicy {
    fun decide(installedCode: Int, m: UpdateManifest): UpdateDecision = when {
        installedCode >= m.versionCode -> UpdateDecision.UP_TO_DATE
        installedCode < m.minSupportedVersionCode -> UpdateDecision.FORCED
        else -> UpdateDecision.AVAILABLE
    }
}

object UpdateThrottle {
    const val INTERVAL_MS = 24L * 60 * 60 * 1000

    /** At most one automatic check a day. A clock that went backwards counts as "never checked". */
    fun shouldCheck(lastCheckMs: Long, nowMs: Long, intervalMs: Long = INTERVAL_MS): Boolean =
        lastCheckMs <= 0L || nowMs < lastCheckMs || nowMs - lastCheckMs >= intervalMs
}

object UpdateUrlPolicy {
    private fun parts(url: String): Triple<String, String, Int>? = try {
        val u = URI(url)
        val host = u.host?.lowercase()
        if (u.scheme?.lowercase() == "https" && host != null) Triple("https", host, if (u.port == -1) 443 else u.port) else null
    } catch (e: Exception) {
        null
    }

    fun isHttps(url: String): Boolean = parts(url) != null

    /** The APK must come from the same host (and port) as version.json, so one trusted place hosts both. */
    fun sameOrigin(manifestUrl: String, apkUrl: String): Boolean {
        val a = parts(manifestUrl) ?: return false
        val b = parts(apkUrl) ?: return false
        return a == b
    }
}

object UpdateDownload {
    /** Where to resume a partial download: 0 (start over) unless there is a usable partial file. */
    fun resumeOffset(partialSize: Long, expectedSize: Long?): Long = when {
        partialSize <= 0L -> 0L
        expectedSize != null && partialSize >= expectedSize -> 0L // complete or oversized: do not trust it
        else -> partialSize
    }

    /** After asking for a byte range, only a 206 reply may be appended; anything else means start over. */
    fun canAppend(requestedOffset: Long, httpStatus: Int): Boolean = requestedOffset > 0L && httpStatus == 206
}

object Sha256 {
    fun ofFile(file: File): String {
        val md = MessageDigest.getInstance("SHA-256")
        file.inputStream().use { input ->
            val buf = ByteArray(64 * 1024)
            while (true) {
                val n = input.read(buf)
                if (n < 0) break
                md.update(buf, 0, n)
            }
        }
        return md.digest().joinToString("") { "%02x".format(it) }
    }

    fun matches(expected: String, actual: String): Boolean = MessageDigest.isEqual(
        expected.lowercase().toByteArray(),
        actual.lowercase().toByteArray(),
    )
}

/** Checks on the downloaded file's own package info, before it is handed to the installer. */
object ApkCheck {
    sealed class Verdict {
        object Ok : Verdict()
        data class Reject(val reason: String) : Verdict()
    }

    fun verify(
        installedPackage: String,
        installedCode: Int,
        apkPackage: String?,
        apkCode: Int?,
        manifestCode: Int,
    ): Verdict = when {
        apkPackage == null || apkCode == null -> Verdict.Reject("The downloaded file is not a readable APK.")
        apkPackage != installedPackage -> Verdict.Reject("The downloaded app is a different app.")
        apkCode != manifestCode -> Verdict.Reject("The downloaded version does not match the update notice.")
        apkCode <= installedCode -> Verdict.Reject("The downloaded version is not newer than the installed one.")
        else -> Verdict.Ok
    }
}
