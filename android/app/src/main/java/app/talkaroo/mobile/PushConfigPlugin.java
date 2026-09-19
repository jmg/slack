package app.talkaroo.mobile;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Tells the web layer whether this build can do push.
 *
 * Firebase is configured by android/app/google-services.json. Without it the
 * Google Services plugin is not applied, the google_app_id resource does not
 * exist, FirebaseApp never initialises and PushNotifications.register() throws
 * IllegalStateException on the native side. Capacitor rethrows anything a
 * plugin method throws as RuntimeException: it is not a rejected promise, the
 * process DIES and the app "closes by itself" on launch.
 *
 * That is not hypothetical here. The shell loads the LIVE site, so this web
 * code also runs inside the already-installed 1.0 APK, which shipped without
 * Firebase and without this plugin. There the call rejects, and the web layer
 * reads a rejection as "no push", which is the safe answer.
 *
 * It reads the same resource FirebaseOptions.fromResource() uses, so it needs
 * no Firebase class on the app module's classpath.
 */
@CapacitorPlugin(name = "PushConfig")
public class PushConfigPlugin extends Plugin {

    @PluginMethod
    public void isConfigured(PluginCall call) {
        int id = getContext().getResources().getIdentifier("google_app_id", "string", getContext().getPackageName());
        JSObject ret = new JSObject();
        ret.put("value", id != 0);
        call.resolve(ret);
    }
}
