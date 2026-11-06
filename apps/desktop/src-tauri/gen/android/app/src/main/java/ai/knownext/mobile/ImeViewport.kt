package ai.knownext.mobile

import android.graphics.Rect
import android.view.View
import android.view.ViewTreeObserver
import android.webkit.WebView
import androidx.core.graphics.Insets
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat

// Account only for the actual occlusion: some Android versions already resize the container.
internal fun keyboardOcclusion(contentBottom: Int, visibleBottom: Int, imeBottom: Int): Int =
    (contentBottom - visibleBottom).coerceAtLeast(0).coerceAtMost(imeBottom.coerceAtLeast(0))

// A gesture bar can remain inside the visible frame on edge-to-edge windows.
// Compare with the decor boundary too; a container already fitted above it gets zero.
internal fun navigationOcclusion(contentBottom: Int, visibleBottom: Int, windowBottom: Int, navigationBottom: Int): Int =
    keyboardOcclusion(contentBottom, minOf(visibleBottom, (windowBottom - navigationBottom.coerceAtLeast(0)).coerceAtLeast(0)), navigationBottom)

// Reserve only the status area still covering the actual content. Include existing
// padding in contentTop so a fitted parent never receives the same inset twice.
internal fun statusOcclusion(contentTop: Int, windowTop: Int, statusTop: Int): Int =
    (windowTop + statusTop.coerceAtLeast(0) - contentTop).coerceAtLeast(0).coerceAtMost(statusTop.coerceAtLeast(0))

/** Resize the native container so older WebViews also expose a usable CSS viewport. */
internal fun installImeViewport(webView: WebView): () -> Unit {
    val root = webView.parent as? View ?: return {}
    val originalLeft = root.paddingLeft
    val originalTop = root.paddingTop
    val originalRight = root.paddingRight
    val originalBottom = root.paddingBottom
    val visible = Rect()
    val position = IntArray(2)
    val windowPosition = IntArray(2)
    var latestInsets: WindowInsetsCompat? = null

    fun applyInsets(insets: WindowInsetsCompat): Int {
        val ime = insets.getInsets(WindowInsetsCompat.Type.ime()).bottom
        root.getWindowVisibleDisplayFrame(visible)
        root.getLocationOnScreen(position)
        root.rootView.getLocationOnScreen(windowPosition)
        val contentBottom = position[1] + root.height - originalBottom
        val status = insets.getInsets(WindowInsetsCompat.Type.statusBars()).top
        val top = originalTop + statusOcclusion(position[1] + originalTop, windowPosition[1], status)
        val navigation = insets.getInsets(WindowInsetsCompat.Type.navigationBars()).bottom
        val extra = if (ime > 0) keyboardOcclusion(contentBottom, visible.bottom, ime)
            else navigationOcclusion(contentBottom, visible.bottom, windowPosition[1] + root.rootView.height, navigation)
        val bottom = originalBottom + extra
        if (root.paddingBottom != bottom || root.paddingTop != top) root.setPadding(originalLeft, top, originalRight, bottom)
        return extra
    }

    ViewCompat.setOnApplyWindowInsetsListener(root) { _, insets ->
        latestInsets = insets
        val extra = applyInsets(insets)
        if (extra > 0 || insets.getInsets(WindowInsetsCompat.Type.ime()).bottom == 0) {
            // The native container has handled IME space; forward zero, including when hiding.
            WindowInsetsCompat.Builder(insets).setInsets(WindowInsetsCompat.Type.ime(), Insets.NONE).build()
        } else insets
    }
    // Initial inset delivery can precede measurement. A stable parent frame prevents resize loops.
    val layout = ViewTreeObserver.OnGlobalLayoutListener { latestInsets?.let { applyInsets(it) } }
    root.viewTreeObserver.addOnGlobalLayoutListener(layout)
    ViewCompat.requestApplyInsets(root)
    return {
        ViewCompat.setOnApplyWindowInsetsListener(root, null)
        if (root.viewTreeObserver.isAlive) root.viewTreeObserver.removeOnGlobalLayoutListener(layout)
    }
}
