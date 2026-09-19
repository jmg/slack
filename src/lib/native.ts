// Detecting the Android shell, and what THAT build can do.
//
// Capacitor is imported lazily inside each function: the web bundle does not
// pay for it until something asks, and in a browser the answer is always no.

type PushConfigPlugin = { isConfigured(): Promise<{ value: boolean }> };

// A plugin proxy is kept here and never returned from an async function: it
// answers ANY property as if it were a native method, `then` included, so
// resolving a promise with it would treat it as a thenable.
let pushConfig: PushConfigPlugin | null = null;

/** Is this running inside the Android app? */
export async function isNativeApp(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  try {
    const { Capacitor } = await import("@capacitor/core");
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

/**
 * Does this build have Firebase? (android/app/src/main/java/.../PushConfigPlugin.java)
 *
 * Without it, PushNotifications.register() does not reject — it throws native,
 * Capacitor rethrows as RuntimeException and the process DIES. Asking matters
 * because the shell loads the live site: this code also runs inside the already
 * installed 1.0 APK, which shipped without Firebase and without this plugin.
 * There the call rejects, and that counts as "no".
 */
export async function nativePushConfigured(): Promise<boolean> {
  try {
    const { registerPlugin } = await import("@capacitor/core");
    pushConfig ??= registerPlugin<PushConfigPlugin>("PushConfig");
    return await pushConfig
      .isConfigured()
      .then((r) => r.value === true)
      .catch(() => false);
  } catch {
    return false;
  }
}
