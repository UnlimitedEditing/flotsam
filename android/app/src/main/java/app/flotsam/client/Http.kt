package app.flotsam.client

import java.util.concurrent.TimeUnit
import okhttp3.OkHttpClient

object Http {
    /** Graydient's API base, with the trailing slash the paths are appended to. */
    const val apiBase = "https://app.graydient.ai/api/v3/"

    /**
     * No read timeout: a render stream stays open for the length of the render (minutes, and far longer on a
     * workflow's first cold start). Callers that want a deadline set it per request.
     */
    val client: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(30, TimeUnit.SECONDS)
        .readTimeout(0, TimeUnit.MILLISECONDS)
        .writeTimeout(60, TimeUnit.SECONDS)
        .followRedirects(false) // a redirect could carry the API key to another host
        .followSslRedirects(false)
        .build()

    /** Plain request/response calls get a normal timeout. */
    val shortClient: OkHttpClient = client.newBuilder().readTimeout(60, TimeUnit.SECONDS).build()
}
