package app.flotsam.client

import android.Manifest
import android.content.ComponentName
import android.content.ContentValues
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import android.util.Base64
import android.view.WindowManager
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricPrompt
import androidx.core.content.ContextCompat
import androidx.fragment.app.FragmentActivity
import com.getcapacitor.JSObject
import com.getcapacitor.PermissionState
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback
import com.getcapacitor.PluginMethod
import java.io.IOException
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors
import okhttp3.Call
import okhttp3.Callback
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.MultipartBody
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response

/**
 * The bridge between the web app and Android. Everything the web layer cannot do on its own lives here:
 * CORS-free networking with real streaming, Keystore-backed storage of the API key, biometrics, the
 * screenshot block, saving to the gallery, share-in, notifications and the discreet launcher swap.
 */
@CapacitorPlugin(
    name = "FlotsamNative",
    permissions = [Permission(strings = [Manifest.permission.POST_NOTIFICATIONS], alias = "notifications")],
)
class FlotsamNativePlugin : Plugin() {
    private val io = Executors.newCachedThreadPool()
    private val streams = ConcurrentHashMap<String, Call>()
    private val store: SecureStore get() = SecureStore.get(context)

    override fun load() {
        instance = this
    }

    // ── Secure storage and flags ────────────────────────────────────────────────────────────────────────

    @PluginMethod
    fun getApiKey(call: PluginCall) {
        call.resolve(JSObject().put("value", store.apiKey() ?: ""))
    }

    @PluginMethod
    fun setApiKey(call: PluginCall) {
        store.setApiKey(call.getString("value")?.takeIf { it.isNotEmpty() })
        call.resolve()
    }

    /** Mirrors flags from the web layer that the background worker needs. */
    @PluginMethod
    fun setFlags(call: PluginCall) {
        call.data.let { d ->
            if (d.has("consent")) store.consent = call.getBoolean("consent", false) == true
        }
        call.resolve()
    }

    /** "Clear all data": wipes the key, flags, watch-list and any shared images, and stops background work. */
    @PluginMethod
    fun clearAll(call: PluginCall) {
        store.clearAll()
        Scheduler.cancel(context)
        SharedImages.clear(context)
        call.resolve()
    }

    // ── Background render watch ─────────────────────────────────────────────────────────────────────────

    @PluginMethod
    fun watchRender(call: PluginCall) {
        val jobId = call.getString("jobId")
        val hash = call.getString("renderHash")
        if (jobId.isNullOrEmpty() || hash.isNullOrEmpty()) return call.reject("jobId and renderHash required")
        val list = store.updatePending { PendingJobs.add(it, PendingJob(jobId, hash, System.currentTimeMillis())) }
        Scheduler.sync(context, list.isNotEmpty())
        call.resolve()
    }

    @PluginMethod
    fun unwatchRender(call: PluginCall) {
        val jobId = call.getString("jobId") ?: return call.reject("jobId required")
        val list = store.updatePending { PendingJobs.remove(it, jobId) }
        Scheduler.sync(context, list.isNotEmpty())
        call.resolve()
    }

    // ── Networking ──────────────────────────────────────────────────────────────────────────────────────

    private fun buildRequest(call: PluginCall, body: okhttp3.RequestBody?): Request? {
        val url = call.getString("url")
        if (url.isNullOrEmpty() || !HostPolicy.isApiAllowed(url)) {
            call.reject("Host not allowed")
            return null
        }
        val b = Request.Builder().url(url)
        var hasAuth = false
        val headers = call.getObject("headers")
        if (headers != null) {
            for (name in headers.keys()) {
                val value = headers.optString(name, "")
                if (name.equals("authorization", ignoreCase = true)) {
                    if (!HostPolicy.mayCarryAuth(url)) continue // the key never goes to other hosts
                    hasAuth = true
                }
                b.header(name, value)
            }
        }
        if (!hasAuth && HostPolicy.mayCarryAuth(url)) store.apiKey()?.let { b.header("Authorization", "Bearer $it") }
        val method = (call.getString("method") ?: "GET").uppercase()
        b.method(method, if (method == "GET" || method == "HEAD") null else body ?: ByteArray(0).toRequestBody(null))
        return b.build()
    }

    private fun jsonBody(call: PluginCall): okhttp3.RequestBody? {
        val text = call.getString("body") ?: return null
        val type = call.getObject("headers")?.optString("Content-Type", "")?.ifEmpty { null } ?: "application/json"
        return text.toRequestBody(type.toMediaTypeOrNull())
    }

    /** One request, one response (no streaming). */
    @PluginMethod
    fun request(call: PluginCall) {
        val req = buildRequest(call, jsonBody(call)) ?: return
        Http.shortClient.newCall(req).enqueue(object : Callback {
            override fun onFailure(c: Call, e: IOException) = call.reject(e.message ?: "Network error")

            override fun onResponse(c: Call, response: Response) {
                response.use { r ->
                    val h = JSObject()
                    for (name in r.headers.names()) h.put(name, r.header(name))
                    call.resolve(JSObject().put("status", r.code).put("headers", h).put("body", r.body?.string() ?: ""))
                }
            }
        })
    }

    /**
     * Streams a response line by line to the web layer ("streamLine" events) as it arrives. If the request is
     * a render submit (a jobId is given) the render hash is saved to the watch-list the moment it appears, so
     * a render started and then backgrounded can still be tracked.
     */
    @PluginMethod
    fun stream(call: PluginCall) {
        val id = call.getString("id") ?: return call.reject("id required")
        val jobId = call.getString("jobId")
        val req = buildRequest(call, jsonBody(call)) ?: return
        val c = Http.client.newCall(req)
        streams[id] = c
        c.enqueue(object : Callback {
            override fun onFailure(c: Call, e: IOException) {
                streams.remove(id)
                end(id, 0, if (c.isCanceled()) "canceled" else (e.message ?: "Network error"), null)
            }

            override fun onResponse(c: Call, response: Response) {
                response.use { r ->
                    if (!r.isSuccessful) {
                        streams.remove(id)
                        return end(id, r.code, null, r.body?.string())
                    }
                    try {
                        val source = r.body!!.source()
                        while (!source.exhausted()) {
                            val line = source.readUtf8Line() ?: break
                            notifyListeners("streamLine", JSObject().put("id", id).put("line", line))
                            val event = Sse.parseLine(line) ?: continue
                            if (jobId != null) trackJob(jobId, event)
                        }
                        end(id, r.code, null, null)
                    } catch (e: IOException) {
                        end(id, r.code, if (c.isCanceled()) "canceled" else (e.message ?: "Stream interrupted"), null)
                    } finally {
                        streams.remove(id)
                    }
                }
            }
        })
        call.resolve()
    }

    private fun trackJob(jobId: String, event: SseEvent) {
        when (event.name) {
            "render_queued" -> Sse.renderHash(event)?.let { hash ->
                val list = store.updatePending { PendingJobs.add(it, PendingJob(jobId, hash, System.currentTimeMillis())) }
                Scheduler.sync(context, list.isNotEmpty())
            }
            "rendering_done", "rendering_error" -> {
                val list = store.updatePending { PendingJobs.remove(it, jobId) }
                Scheduler.sync(context, list.isNotEmpty())
            }
        }
    }

    private fun end(id: String, status: Int, error: String?, body: String?) {
        notifyListeners(
            "streamEnd",
            JSObject().put("id", id).put("status", status).put("error", error ?: "").put("body", body ?: ""),
        )
    }

    @PluginMethod
    fun cancelStream(call: PluginCall) {
        streams.remove(call.getString("id"))?.cancel()
        call.resolve()
    }

    /** Multipart upload (used for the user's chosen image host). The file arrives as base64. */
    @PluginMethod
    fun upload(call: PluginCall) {
        val url = call.getString("url")
        if (url.isNullOrEmpty() || !HostPolicy.isApiAllowed(url)) return call.reject("Host not allowed")
        val data = call.getString("fileBase64") ?: return call.reject("fileBase64 required")
        val bytes = try {
            Base64.decode(data, Base64.DEFAULT)
        } catch (e: IllegalArgumentException) {
            return call.reject("Bad file data")
        }
        val mime = call.getString("mime") ?: "application/octet-stream"
        val multipart = MultipartBody.Builder().setType(MultipartBody.FORM)
        call.getObject("fields")?.let { f -> for (k in f.keys()) multipart.addFormDataPart(k, f.optString(k, "")) }
        multipart.addFormDataPart(
            call.getString("fileField") ?: "file",
            call.getString("fileName") ?: "upload.bin",
            bytes.toRequestBody(mime.toMediaTypeOrNull()),
        )
        val req = Request.Builder().url(url).post(multipart.build()).build() // no auth: uploads go to third parties
        Http.shortClient.newCall(req).enqueue(object : Callback {
            override fun onFailure(c: Call, e: IOException) = call.reject(e.message ?: "Upload failed")

            override fun onResponse(c: Call, response: Response) {
                response.use { call.resolve(JSObject().put("status", it.code).put("body", it.body?.string() ?: "")) }
            }
        })
    }

    // ── Biometrics, screen protection ───────────────────────────────────────────────────────────────────

    private val authenticators =
        BiometricManager.Authenticators.BIOMETRIC_STRONG or BiometricManager.Authenticators.BIOMETRIC_WEAK

    @PluginMethod
    fun biometricAvailable(call: PluginCall) {
        val ok = BiometricManager.from(context).canAuthenticate(authenticators) == BiometricManager.BIOMETRIC_SUCCESS
        call.resolve(JSObject().put("available", ok))
    }

    @PluginMethod
    fun biometricAuth(call: PluginCall) {
        val act = activity as? FragmentActivity ?: return call.reject("No activity")
        val title = call.getString("title") ?: "Unlock"
        act.runOnUiThread {
            val prompt = BiometricPrompt(
                act,
                ContextCompat.getMainExecutor(context),
                object : BiometricPrompt.AuthenticationCallback() {
                    override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                        call.resolve(JSObject().put("success", true))
                    }

                    override fun onAuthenticationError(code: Int, message: CharSequence) {
                        call.resolve(JSObject().put("success", false).put("error", message.toString()))
                    }
                },
            )
            prompt.authenticate(
                BiometricPrompt.PromptInfo.Builder()
                    .setTitle(title)
                    .setNegativeButtonText("Use PIN")
                    .setAllowedAuthenticators(authenticators)
                    .build(),
            )
        }
    }

    /** Blocks screenshots, screen recording and the app-switcher thumbnail. */
    @PluginMethod
    fun setSecure(call: PluginCall) {
        val on = call.getBoolean("enabled", false) == true
        activity.runOnUiThread {
            if (on) {
                activity.window.setFlags(WindowManager.LayoutParams.FLAG_SECURE, WindowManager.LayoutParams.FLAG_SECURE)
            } else {
                activity.window.clearFlags(WindowManager.LayoutParams.FLAG_SECURE)
            }
        }
        call.resolve()
    }

    // ── Saving ──────────────────────────────────────────────────────────────────────────────────────────

    /** Saves a result into the gallery. Only ever called from an explicit Save tap. */
    @PluginMethod
    fun saveToGallery(call: PluginCall) {
        val url = call.getString("url")
        val data = call.getString("base64")
        val mime = call.getString("mime") ?: "application/octet-stream"
        val name = (call.getString("name") ?: "flotsam").replace(Regex("[\\\\/:*?\"<>|]"), "_")
        if (url == null && data == null) return call.reject("url or base64 required")
        if (url != null && !HostPolicy.isDownloadAllowed(url)) return call.reject("URL not allowed")
        io.execute {
            try {
                val uri = MediaSaver.save(context, name, mime) { out ->
                    if (data != null) {
                        out.write(Base64.decode(data, Base64.DEFAULT))
                    } else {
                        Http.shortClient.newCall(Request.Builder().url(url!!).build()).execute().use { r ->
                            if (!r.isSuccessful) throw IOException("Download failed (${r.code})")
                            r.body!!.byteStream().copyTo(out)
                        }
                    }
                }
                call.resolve(JSObject().put("uri", uri.toString()))
            } catch (e: Exception) {
                call.reject(e.message ?: "Could not save")
            }
        }
    }

    // ── Notifications ───────────────────────────────────────────────────────────────────────────────────

    @PluginMethod
    fun notificationState(call: PluginCall) {
        call.resolve(JSObject().put("state", permissionLabel()))
    }

    @PluginMethod
    fun requestNotificationPermission(call: PluginCall) {
        if (Build.VERSION.SDK_INT < 33 || Notifier.canNotify(context)) {
            return call.resolve(JSObject().put("state", "granted"))
        }
        requestPermissionForAlias("notifications", call, "notificationsCallback")
    }

    @PermissionCallback
    private fun notificationsCallback(call: PluginCall) {
        call.resolve(JSObject().put("state", permissionLabel()))
    }

    private fun permissionLabel(): String = when {
        Build.VERSION.SDK_INT < 33 || Notifier.canNotify(context) -> "granted"
        getPermissionState("notifications") == PermissionState.DENIED -> "denied"
        else -> "prompt"
    }

    /** A generic notification from the foreground-but-hidden app. Same wording rules as the background worker. */
    @PluginMethod
    fun notify(call: PluginCall) {
        val jobId = call.getString("jobId") ?: return call.reject("jobId required")
        Notifier.show(context, jobId, call.getBoolean("ok", true) == true, store.discreet)
        call.resolve()
    }

    // ── Discreet launcher ───────────────────────────────────────────────────────────────────────────────

    /** Swaps the launcher entry between "Flotsam" and a neutral "Notes" (separate aliases of the same activity). */
    @PluginMethod
    fun setDiscreet(call: PluginCall) {
        val on = call.getBoolean("enabled", false) == true
        store.discreet = on
        val pm = context.packageManager
        fun setAlias(name: String, enabled: Boolean) = pm.setComponentEnabledSetting(
            ComponentName(context, "${context.packageName}.$name"),
            if (enabled) PackageManager.COMPONENT_ENABLED_STATE_ENABLED else PackageManager.COMPONENT_ENABLED_STATE_DISABLED,
            PackageManager.DONT_KILL_APP,
        )
        setAlias("NeutralAlias", on)
        setAlias("DefaultAlias", !on)
        call.resolve()
    }

    // ── Self-update ─────────────────────────────────────────────────────────────────────────────────────

    private val updater by lazy { AppUpdater(context) }

    private fun updateState(error: String? = null, checked: Boolean = false): JSObject {
        val installed = updater.installed()
        val m = updater.cachedManifest()
        val o = JSObject()
            .put("enabled", updater.enabled)
            .put("installedCode", installed.code)
            .put("installedName", installed.name)
            .put("lastCheck", updater.lastCheck())
            .put("checked", checked)
            .put("decision", updater.decision()?.name?.lowercase() ?: "none")
            .put("error", error ?: "")
        if (m != null) {
            o.put(
                "manifest",
                JSObject().put("versionCode", m.versionCode).put("versionName", m.versionName).put("notes", m.notes)
                    .put("size", m.size ?: 0L),
            )
        }
        return o
    }

    /** Cached state, no network. Used at startup so a forced update blocks even offline. */
    @PluginMethod
    fun updateStatus(call: PluginCall) {
        updater.purgeStaleIfCurrent()
        call.resolve(updateState())
    }

    /** Checks version.json. With `auto` it respects the once-a-day limit; otherwise it always asks. */
    @PluginMethod
    fun updateCheck(call: PluginCall) {
        if (!updater.enabled) return call.resolve(updateState())
        val auto = call.getBoolean("auto", false) == true
        if (auto && !UpdateThrottle.shouldCheck(updater.lastCheck(), System.currentTimeMillis())) {
            return call.resolve(updateState())
        }
        io.execute {
            try {
                updater.check()
                call.resolve(updateState(checked = true))
            } catch (e: UpdateError) {
                call.resolve(updateState(error = e.message)) // keep the cached decision; report why the check failed
            }
        }
    }

    /** Downloads and verifies the update, emitting "updateProgress" as it goes. */
    @PluginMethod
    fun updateDownload(call: PluginCall) {
        io.execute {
            try {
                val file = updater.download { done, total ->
                    notifyListeners("updateProgress", JSObject().put("done", done).put("total", total ?: 0L))
                }
                call.resolve(JSObject().put("ready", true).put("size", file.length()))
            } catch (e: UpdateError) {
                call.reject(e.message)
            } catch (e: Exception) {
                call.reject("The update could not be downloaded.")
            }
        }
    }

    @PluginMethod
    fun updateInstall(call: PluginCall) {
        val apk = updater.readyFile() ?: return call.reject("No verified update is ready. Download it first.")
        if (!updater.canInstallUnknown()) return call.resolve(JSObject().put("needsPermission", true))
        io.execute {
            try {
                updater.install(apk)
                call.resolve(JSObject().put("started", true))
            } catch (e: Exception) {
                call.reject(e.message ?: "Could not start the installation.")
            }
        }
    }

    /** Opens Android's "install unknown apps" screen for this app. */
    @PluginMethod
    fun updateOpenInstallSettings(call: PluginCall) {
        context.startActivity(updater.unknownSourcesIntent())
        call.resolve()
    }

    // ── Share-in ────────────────────────────────────────────────────────────────────────────────────────

    @PluginMethod
    fun sharedCount(call: PluginCall) {
        call.resolve(JSObject().put("count", SharedImages.count(context)))
    }

    @PluginMethod
    fun takeShared(call: PluginCall) {
        io.execute {
            val images = com.getcapacitor.JSArray()
            for (i in SharedImages.take(context)) {
                images.put(JSObject().put("name", i.name).put("mime", i.mime).put("base64", i.base64))
            }
            call.resolve(JSObject().put("images", images))
        }
    }

    private fun announceShare(count: Int) {
        // Retained until the web layer subscribes, so a share that launched the app is not lost.
        notifyListeners("shareReceived", JSObject().put("count", count), true)
    }

    companion object {
        @Volatile private var instance: FlotsamNativePlugin? = null
        private val worker = Executors.newSingleThreadExecutor()

        /** Called by UpdateReceiver when Android reports that installing the update failed. */
        fun reportUpdateFailure(message: String) {
            instance?.notifyListeners("updateFailed", JSObject().put("message", message))
        }

        /** Called by MainActivity when an image is shared into the app. */
        fun handleShare(context: Context, intent: android.content.Intent?) {
            val uris = SharedImages.urisFrom(intent)
            if (uris.isEmpty()) return
            worker.execute {
                val added = SharedImages.store(context, uris)
                if (added > 0) instance?.announceShare(SharedImages.count(context))
            }
        }
    }
}

/** Writes a result into MediaStore (scoped storage), so no storage permission is needed on Android 10+. */
object MediaSaver {
    fun save(context: Context, name: String, mime: String, write: (java.io.OutputStream) -> Unit): android.net.Uri {
        val (collection, dir) = when {
            mime.startsWith("image/") -> MediaStore.Images.Media.EXTERNAL_CONTENT_URI to "${Environment.DIRECTORY_PICTURES}/Flotsam"
            mime.startsWith("video/") -> MediaStore.Video.Media.EXTERNAL_CONTENT_URI to "${Environment.DIRECTORY_MOVIES}/Flotsam"
            mime.startsWith("audio/") -> MediaStore.Audio.Media.EXTERNAL_CONTENT_URI to "${Environment.DIRECTORY_MUSIC}/Flotsam"
            else -> MediaStore.Downloads.EXTERNAL_CONTENT_URI to "${Environment.DIRECTORY_DOWNLOADS}/Flotsam"
        }
        val values = ContentValues().apply {
            put(MediaStore.MediaColumns.DISPLAY_NAME, name)
            put(MediaStore.MediaColumns.MIME_TYPE, mime)
            put(MediaStore.MediaColumns.RELATIVE_PATH, dir)
            put(MediaStore.MediaColumns.IS_PENDING, 1)
        }
        val resolver = context.contentResolver
        val uri = resolver.insert(collection, values) ?: throw IOException("Could not create the file")
        try {
            resolver.openOutputStream(uri)?.use(write) ?: throw IOException("Could not open the file")
            resolver.update(uri, ContentValues().apply { put(MediaStore.MediaColumns.IS_PENDING, 0) }, null, null)
        } catch (e: Exception) {
            resolver.delete(uri, null, null)
            throw e
        }
        return uri
    }
}
