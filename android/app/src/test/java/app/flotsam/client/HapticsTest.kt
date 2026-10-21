package app.flotsam.client

import android.view.HapticFeedbackConstants
import org.junit.Assert.assertEquals
import org.junit.Test

class HapticsTest {
    @Test
    fun successAndErrorUseTheDedicatedConstantsOnAndroid11Plus() {
        assertEquals(HapticFeedbackConstants.CONFIRM, Haptics.constantFor("success", 30))
        assertEquals(HapticFeedbackConstants.REJECT, Haptics.constantFor("error", 34))
    }

    @Test
    fun androidTenFallsBackToALongPressBuzz() {
        assertEquals(HapticFeedbackConstants.LONG_PRESS, Haptics.constantFor("success", 29))
        assertEquals(HapticFeedbackConstants.LONG_PRESS, Haptics.constantFor("error", 29))
    }

    @Test
    fun selectAndUnknownTypesAreLight() {
        assertEquals(HapticFeedbackConstants.CLOCK_TICK, Haptics.constantFor("select", 30))
        assertEquals(HapticFeedbackConstants.VIRTUAL_KEY, Haptics.constantFor("tap", 30))
        assertEquals(HapticFeedbackConstants.VIRTUAL_KEY, Haptics.constantFor(null, 30))
        assertEquals(HapticFeedbackConstants.VIRTUAL_KEY, Haptics.constantFor("nonsense", 30))
    }
}
