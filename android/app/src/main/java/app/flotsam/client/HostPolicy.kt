package app.flotsam.client

import java.net.URI

/**
 * Which hosts the native HTTP bridge may call. The WebView only ever loads our bundled app, but the bridge
 * can carry the user's API key, so it is locked to the services Flotsam actually uses.
 */
object HostPolicy {
    const val GRAYDIENT_HOST = "app.graydient.ai"
    private val apiHosts = setOf(GRAYDIENT_HOST, "catbox.moe", "modeltrends.ai")

    private fun host(url: String): String? = try {
        val u = URI(url)
        if (u.scheme?.lowercase() == "https") u.host?.lowercase() else null
    } catch (e: Exception) {
        null
    }

    /** API/upload calls: https only, on the allowed hosts. */
    fun isApiAllowed(url: String): Boolean = host(url) in apiHosts

    /** The Authorization header may only ever be sent to Graydient. */
    fun mayCarryAuth(url: String): Boolean = host(url) == GRAYDIENT_HOST

    /** Saving a result to the gallery: any https URL (result files live on Graydient's storage), never with auth. */
    fun isDownloadAllowed(url: String): Boolean = host(url) != null
}
