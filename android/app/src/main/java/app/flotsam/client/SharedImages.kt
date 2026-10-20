package app.flotsam.client

import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.os.Build
import android.util.Base64
import java.io.ByteArrayOutputStream
import java.io.File

/**
 * Images other apps share into Flotsam. They are downscaled and copied into our private cache the moment the
 * share arrives (the permission on the source URI is short-lived), then handed to the web layer on request.
 * Nothing is written to shared storage, and everything is deleted once the web layer has taken it.
 */
object SharedImages {
    private const val DIR = "shared"
    private const val MAX_DIM = 1536
    private const val MAX_ITEMS = 5

    data class Item(val name: String, val mime: String, val base64: String)

    /** Extracts the shared image URIs from a SEND / SEND_MULTIPLE intent (empty for any other intent). */
    @Suppress("DEPRECATION")
    fun urisFrom(intent: Intent?): List<Uri> {
        if (intent == null) return emptyList()
        val type = intent.type ?: return emptyList()
        if (!type.startsWith("image/")) return emptyList()
        return when (intent.action) {
            Intent.ACTION_SEND -> listOfNotNull(
                if (Build.VERSION.SDK_INT >= 33) intent.getParcelableExtra(Intent.EXTRA_STREAM, Uri::class.java)
                else intent.getParcelableExtra(Intent.EXTRA_STREAM) as? Uri,
            )
            Intent.ACTION_SEND_MULTIPLE ->
                (if (Build.VERSION.SDK_INT >= 33) intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM, Uri::class.java)
                else intent.getParcelableArrayListExtra<Uri>(Intent.EXTRA_STREAM)).orEmpty()
            else -> emptyList()
        }
    }

    /** Copies (downscaled, as JPEG) into the private cache. Returns how many were stored. */
    fun store(context: Context, uris: List<Uri>): Int {
        val dir = File(context.cacheDir, DIR).apply { mkdirs() }
        var n = dir.listFiles()?.size ?: 0
        var added = 0
        for (uri in uris.take(MAX_ITEMS)) {
            val jpeg = try {
                context.contentResolver.openInputStream(uri)?.use { downscale(it.readBytes()) }
            } catch (e: Exception) {
                null
            } ?: continue
            File(dir, "shared-${System.currentTimeMillis()}-${n++}.jpg").writeBytes(jpeg)
            added++
        }
        return added
    }

    fun count(context: Context): Int = File(context.cacheDir, DIR).listFiles()?.size ?: 0

    /** Returns everything waiting and deletes it. */
    fun take(context: Context): List<Item> {
        val files = File(context.cacheDir, DIR).listFiles()?.sortedBy { it.name }.orEmpty()
        val items = files.map { Item(it.name, "image/jpeg", Base64.encodeToString(it.readBytes(), Base64.NO_WRAP)) }
        files.forEach { it.delete() }
        return items
    }

    fun clear(context: Context) {
        File(context.cacheDir, DIR).listFiles()?.forEach { it.delete() }
    }

    private fun downscale(bytes: ByteArray): ByteArray? {
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
        if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return null
        var sample = 1
        while (maxOf(bounds.outWidth, bounds.outHeight) / (sample * 2) >= MAX_DIM) sample *= 2
        val bmp = BitmapFactory.decodeByteArray(bytes, 0, bytes.size, BitmapFactory.Options().apply { inSampleSize = sample })
            ?: return null
        val scale = minOf(1f, MAX_DIM.toFloat() / maxOf(bmp.width, bmp.height))
        val out = if (scale < 1f) {
            Bitmap.createScaledBitmap(bmp, (bmp.width * scale).toInt(), (bmp.height * scale).toInt(), true)
        } else {
            bmp
        }
        val stream = ByteArrayOutputStream()
        out.compress(Bitmap.CompressFormat.JPEG, 90, stream)
        return stream.toByteArray()
    }
}
