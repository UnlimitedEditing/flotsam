package app.flotsam.client

import org.json.JSONArray
import org.json.JSONObject

/** Decides from a `GET render/<hash>/` response whether the render has produced media yet. */
object RenderStatus {
    fun hasMedia(body: String): Boolean {
        val root = try {
            JSONObject(body)
        } catch (e: Exception) {
            return false
        }
        // JSON:API wraps the record in data.attributes; the plain form has `images` at the top.
        val record = root.optJSONObject("data")?.optJSONObject("attributes") ?: root
        val images = record.optJSONArray("images") ?: return false
        return anyUrl(images)
    }

    private fun anyUrl(images: JSONArray): Boolean {
        for (i in 0 until images.length()) {
            val img = images.optJSONObject(i) ?: continue
            if (img.optString("url", "").isNotEmpty()) return true
            val media = img.optJSONArray("media") ?: continue
            for (j in 0 until media.length()) {
                if (media.optJSONObject(j)?.optString("url", "")?.isNotEmpty() == true) return true
            }
        }
        return false
    }
}
