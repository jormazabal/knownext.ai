package ai.knownext.mobile

import org.junit.Assert.assertEquals
import org.junit.Test

class ImeViewportTest {
    @Test fun statusBarOcclusionReservesOnlyTheCoveredHeader() {
        assertEquals(72, statusOcclusion(0, 0, 72))
        assertEquals(52, statusOcclusion(20, 0, 72))
        assertEquals(72, statusOcclusion(100, 100, 72))
    }
    @Test fun fittedOrHiddenStatusBarAddsNoSpace() {
        assertEquals(0, statusOcclusion(72, 0, 72))
        assertEquals(0, statusOcclusion(100, 0, 72))
        assertEquals(0, statusOcclusion(0, 0, 0))
        assertEquals(0, statusOcclusion(0, 0, -1))
    }
    @Test fun fixedWindowReservesOnlyTheOccludedKeyboardSpace() {
        assertEquals(850, keyboardOcclusion(2400, 1550, 850))
        assertEquals(50, keyboardOcclusion(2000, 1950, 400))
    }
    @Test fun alreadyResizedWindowIsNotPaddedTwice() {
        assertEquals(0, keyboardOcclusion(1550, 1550, 850))
        assertEquals(0, keyboardOcclusion(1500, 1550, 850))
    }
    @Test fun hiddenKeyboardDoesNotReserveNavigationBarOrStaleSpace() {
        assertEquals(0, keyboardOcclusion(2400, 2330, 0))
        assertEquals(0, keyboardOcclusion(2400, 1550, -1))
    }
    @Test fun edgeToEdgeNavigationReservesTheGestureAreaEvenWhenVisibleFrameIncludesIt() {
        assertEquals(70, navigationOcclusion(2400, 2400, 2400, 70))
        assertEquals(70, navigationOcclusion(2400, 2330, 2400, 70))
    }
    @Test fun navigationAlreadyExcludedByTheContainerIsNotReservedTwice() {
        assertEquals(0, navigationOcclusion(2330, 2330, 2400, 70))
        assertEquals(0, navigationOcclusion(2400, 2400, 2400, 0))
    }
}
