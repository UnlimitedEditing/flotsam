package app.flotsam.client

import android.os.Build
import android.view.HapticFeedbackConstants

/** Maps the web layer's haptic names to Android's system haptic constants (pure, so it is unit-tested). */
object Haptics {
    fun constantFor(type: String?, sdk: Int): Int = when (type) {
        "success" -> if (sdk >= Build.VERSION_CODES.R) HapticFeedbackConstants.CONFIRM else HapticFeedbackConstants.LONG_PRESS
        "error" -> if (sdk >= Build.VERSION_CODES.R) HapticFeedbackConstants.REJECT else HapticFeedbackConstants.LONG_PRESS
        "select" -> HapticFeedbackConstants.CLOCK_TICK
        else -> HapticFeedbackConstants.VIRTUAL_KEY // "tap" and anything unknown: a light click
    }
}
