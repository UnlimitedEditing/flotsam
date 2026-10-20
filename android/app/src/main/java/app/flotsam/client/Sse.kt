package app.flotsam.client

import org.json.JSONObject

/** One event from Graydient's render stream. Mirrors src/api/stream.ts so both sides read it the same way. */
data class SseEvent(val name: String, val data: JSONObject)

object Sse {
    private val aliases = mapOf(
        "started" to "rendering_started",
        "done" to "rendering_done",
        "error" to "rendering_error",
    )
    private val wrapped = listOf("render_queued", "rendering_started", "rendering_done", "rendering_error")

    /** Returns null for blank lines, [DONE] and anything that is not a JSON object. */
    fun parseLine(line: String): SseEvent? {
        val raw = (if (line.startsWith("data:")) line.removePrefix("data:") else line).trim()
        if (raw.isEmpty() || raw == "[DONE]") return null
        val obj = try {
            JSONObject(raw)
        } catch (e: Exception) {
            return null
        }
        val event = obj.optString("event", "")
        if (event.isNotEmpty() && obj.opt("event") is String) {
            return SseEvent(aliases[event] ?: event, obj.optJSONObject("data") ?: JSONObject())
        }
        for (key in wrapped) {
            val inner = obj.optJSONObject(key)
            if (inner != null) return SseEvent(key, inner)
        }
        val first = obj.keys().asSequence().firstOrNull() ?: "unknown"
        return SseEvent(first, JSONObject())
    }

    /** The render hash carried by a `render_queued` (or `rendering_done`) event, if any. */
    fun renderHash(e: SseEvent): String? {
        if (e.name != "render_queued" && e.name != "rendering_done") return null
        val h = e.data.optString("render_hash", "")
        return h.ifEmpty { null }
    }
}
