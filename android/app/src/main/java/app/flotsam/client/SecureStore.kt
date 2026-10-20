package app.flotsam.client

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

/**
 * Everything sensitive the native side keeps: the Graydient API key, the watch-list for background checks,
 * and two flags mirrored from the web layer (consent, discreet). Backed by the Android Keystore, so values are
 * encrypted at rest. Owned here (not in the WebView) so the background worker can read it.
 */
class SecureStore private constructor(context: Context) {
    private val prefs: SharedPreferences = run {
        val key = MasterKey.Builder(context).setKeyScheme(MasterKey.KeyScheme.AES256_GCM).build()
        EncryptedSharedPreferences.create(
            context,
            FILE,
            key,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
        )
    }

    fun apiKey(): String? = prefs.getString(KEY_API, null)

    fun setApiKey(value: String?) {
        prefs.edit().apply { if (value == null) remove(KEY_API) else putString(KEY_API, value) }.apply()
    }

    var consent: Boolean
        get() = prefs.getBoolean(KEY_CONSENT, false)
        set(v) = prefs.edit().putBoolean(KEY_CONSENT, v).apply()

    var discreet: Boolean
        get() = prefs.getBoolean(KEY_DISCREET, false)
        set(v) = prefs.edit().putBoolean(KEY_DISCREET, v).apply()

    @Synchronized
    fun pending(): List<PendingJob> = PendingJobs.fromJson(prefs.getString(KEY_PENDING, null))

    @Synchronized
    fun updatePending(change: (List<PendingJob>) -> List<PendingJob>): List<PendingJob> {
        val next = change(pending())
        prefs.edit().putString(KEY_PENDING, PendingJobs.toJson(next)).apply()
        return next
    }

    fun clearAll() {
        prefs.edit().clear().apply()
    }

    companion object {
        private const val FILE = "flotsam_secure"
        private const val KEY_API = "apiKey"
        private const val KEY_CONSENT = "consent"
        private const val KEY_DISCREET = "discreet"
        private const val KEY_PENDING = "pending"

        @Volatile private var instance: SecureStore? = null

        fun get(context: Context): SecureStore =
            instance ?: synchronized(this) {
                instance ?: SecureStore(context.applicationContext).also { instance = it }
            }
    }
}

/** Whether the UI is in the foreground, so background checks never notify about something already on screen. */
object AppState {
    @Volatile var foreground: Boolean = false
}
