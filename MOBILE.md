# Talkaroo's Android app

A Capacitor shell that loads the LIVE site (`https://talkaroo.app/workspaces`),
the same shape as Decknote's and HelpBird's. It does not bundle a build of the
front end: a bundled copy would go stale on every deploy and could not hold a
cookie session. The web half ships with the normal deploy, and **only a native
change needs a new APK**.

## Where everything is

| What | Where |
|---|---|
| Shell configuration | `capacitor.config.ts` |
| Launch and offline screens | `mobile/www/index.html`, `mobile/www/error.html` |
| Native project | `android/` |
| Published APK | `public/download/talkaroo.apk` (and `.zip` as a fallback) |
| App Links verification | `public/.well-known/assetlinks.json` |

## Decisions not worth "simplifying"

- **`androidScheme: "https"` + `hostname: "talkaroo.app"`** make the WebView's
  origin the real site, so the Secure session cookie travels and survives a
  restart. The default `capacitor://` scheme would break both.
- **It starts at `/workspaces`, not `/`.** Whoever installed this came to read
  their team's messages, not the landing page: signed out that route redirects
  to `/login?next=/workspaces`, and signed in the launcher sends them into
  their workspace — which is the right hop when somebody belongs to more than
  one.
- **`errorPath: "error.html"`**: without it, a first launch with no signal
  shows Chrome's raw error page and the app reads as broken.
- **App Links with `autoVerify`**, for `talkaroo.app` and `www.talkaroo.app`:
  Android fetches `assetlinks.json` at install time. That file carries the
  SHA-256 fingerprint of the signing certificate, so changing the key means
  updating it or mention and invite links stop opening the app.
  `wpp.talkaroo.app` is left out on purpose — different product surface, its
  own manifest.
- **The adaptive icon is flat violet behind the bubble alone**, drawn inside
  the 72dp safe zone of a 108dp canvas, so the launcher's mask crops colour and
  never the mark.

## Shipping a new APK

1. Bump `versionCode` and `versionName` in `android/app/build.gradle`.
2. `npx cap sync android`
3. `cd android && ANDROID_HOME=$HOME/Android/Sdk ./gradlew assembleRelease`
4. Copy `android/app/build/outputs/apk/release/app-release.apk` to
   `public/download/talkaroo.apk` and rebuild the `.zip` around that APK.
5. Deploy the site: the APK rides along with it.

## The signing key

It lives in `~/.keystores/talkaroo-release.jks`, with the password in
`~/.keystores/talkaroo-release.password`; `android/keystore.properties` points
at it and is gitignored.

**Losing that key means losing updates**: an APK signed with a different one
will not install over the previous one — it has to be uninstalled, and that
takes the session with it. Keep a copy off this machine.
