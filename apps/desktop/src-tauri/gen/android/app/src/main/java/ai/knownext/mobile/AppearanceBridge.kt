package ai.knownext.mobile

import android.app.Activity
import android.graphics.Color
import android.view.View
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.core.view.WindowInsetsControllerCompat

/** UI-only bridge: no file, network, recording or persistence authority. */
class KnowNextAppearance(private val activity: Activity, private val webView: WebView) {
    @JavascriptInterface fun setTheme(dark: Boolean) {
        webView.post {
            if (activity.isFinishing || activity.isDestroyed) return@post
            // Match --app-bg; the reserved top/bottom areas are native surfaces.
            val background = if (dark) Color.rgb(12, 13, 15) else Color.WHITE
            (webView.parent as? View)?.setBackgroundColor(background)
            webView.setBackgroundColor(background)
            val controller = WindowInsetsControllerCompat(activity.window, activity.window.decorView)
            controller.isAppearanceLightStatusBars = !dark
            controller.isAppearanceLightNavigationBars = !dark
        }
    }
}
