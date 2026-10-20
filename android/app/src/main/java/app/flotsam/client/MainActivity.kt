package app.flotsam.client

import android.content.Intent
import android.os.Bundle
import com.getcapacitor.BridgeActivity

class MainActivity : BridgeActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        registerPlugin(FlotsamNativePlugin::class.java)
        super.onCreate(savedInstanceState)
        FlotsamNativePlugin.handleShare(this, intent) // an app shared an image and this launched us
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent) // deep links (flotsam://job/<id>) go to the web layer through the App plugin
        FlotsamNativePlugin.handleShare(this, intent)
    }

    override fun onResume() {
        super.onResume()
        AppState.foreground = true
    }

    override fun onPause() {
        AppState.foreground = false
        super.onPause()
    }
}
