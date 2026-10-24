# Smallhours TV (Android TV app)

A tiny Android app that shows **only the TV host screen** of Smallhours. It opens
`https://quiz.aldervall.se/tv`, which creates a room and shows `/host/CODE?tv=1`:
the room code, QR and live game screens. Players join from their phones as usual.

- Fullscreen, screen stays on, music and sound play without pressing anything.
- Locked to the host screen: any other page (landing, player, external links) is refused.
- If the room disappears (for example after a server restart), the app creates a new room by itself.
- If the server can't be reached, it shows a message and retries every 5 seconds.
- Remote **Back** twice exits.

## Install on the TV

The APK is served at **https://quiz.aldervall.se/download/smallhours-tv.apk**.

1. On the TV, install the **Downloader** app (by AFTVnews) from the Play Store.
2. Allow it to install unknown apps: *Settings → Apps → Security & restrictions → Unknown sources → Downloader*
   (the menu names vary a little by TV brand).
3. In Downloader, enter `https://quiz.aldervall.se/download/smallhours-tv.apk` and install.
4. **Smallhours TV** shows up on the home screen's apps row.

Alternatives: copy the APK to a USB stick and open it with a file manager, or use
`adb connect <tv-ip>` then `adb install -r smallhours-tv.apk`.

## Build

```bash
./build.sh              # -> dist/smallhours-tv.apk
PUBLISH=1 ./build.sh    # also copy to ../public/download/ (then rebuild the server image to serve it)
TV_URL=https://other.host/tv ./build.sh   # point at another server
VERSION_CODE=2 VERSION_NAME=1.1 ./build.sh   # bump the version for an update
```

There's no Gradle. The script uses the plain SDK tools (aapt2, javac, d8, zipalign,
apksigner). The first run downloads JDK 17 and the Android command-line tools (~750 MB)
into `~/.cache/smallhours-android/`. The icon and TV banner are drawn at build time by
`tools/GenArt.java`.

## Signing key — back it up

The first build creates `keystore/smallhours-tv.jks` and its `keystore/password`
(both gitignored). **Every future update must be signed with this same key.**
Otherwise Android refuses to install it over the old version, and the old app has to
be uninstalled first. Keep a copy somewhere safe.
