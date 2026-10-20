package app.flotsam.client

/** The only wording a notification may use: generic, never the prompt, workflow name or any image. */
object NotificationText {
    data class Text(val title: String, val body: String)

    fun choose(discreet: Boolean, ok: Boolean): Text =
        if (discreet) {
            Text("Reminder", if (ok) "Ready" else "Needs attention")
        } else {
            Text("Flotsam", if (ok) "Your render is ready" else "A render needs attention")
        }
}
