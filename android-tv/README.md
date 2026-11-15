# Smallhours TV (Android TV app)

A tiny Android app that shows **only the TV host screen** of Smallhours. It opens
`https://smallhours.se/tv`, which creates a room and shows `/host/CODE?tv=1`:
the room code, QR and live game screens. Players join from their phones as usual.

- Fullscreen, screen stays on, music and sound play without pressing anything.
- Locked to the host screen: any other page (landing, player, external links) is refused.
- If the room disappears (for example after a server restart), the app creates a new room by itself.
- If the server can't be reached, it shows a message and retries every 5 seconds.
- Remote **Back** twice exits.

## Install on the TV

The APK is served at **https://smallhours.se/download/smallhours-tv.apk**.

1. On the TV, install the **Downloader** app (by AFTVnews) from the Play Store.
2. Allow it to install unknown apps: *Settings → Apps → Security & restrictions → Unknown sources → Downloader*
   (the menu names vary a little by TV brand).
3. In Downloader, enter `https://smallhours.se/download/smallhours-tv.apk` and install.
4. **Smallhours TV** shows up on the home screen's apps row.

Alternatives: copy the APK to a USB stick and open it with a file manager, or use
`adb connect <tv-ip>` then `adb install -r smallhours-tv.apk`.

## Build

```bash
./build.sh              # -> dist/smallhours-tv.apk
PUBLISH=1 ./build.sh    # also copy to ../public/download/ (local testing only)
TV_URL=https://other.host/tv ./build.sh   # point at another server
VERSION_CODE=3 VERSION_NAME=1.2 ./build.sh   # bump the version for an update
```

There's no Gradle. The script uses the plain SDK tools (aapt2, javac, d8, zipalign,
apksigner). The first run downloads JDK 17 and the Android command-line tools (~750 MB)
into `~/.cache/smallhours-android/`. Launcher icons, adaptive foregrounds, the splash mark,
and the Night-Navy TV banner are generated from the canonical SVG brand art in
`../public/images/` by `tools/GenArt.java` at build time.

## Signing key — back it up

The first build creates `keystore/smallhours-tv.jks` and its `keystore/password`
(both gitignored). **Every future update must be signed with this same key.**
Otherwise Android refuses to install it over the old version, and the old app has to
be uninstalled first. Keep a copy somewhere safe.

## Publishing (CI)

The served APK is built by GitHub Actions, not on the server: `.github/workflows/docker.yml`
runs `REQUIRE_KEYSTORE=1 PUBLISH=1 ./build.sh` before building the Docker image, so every
image on GHCR carries the current app at `/download/smallhours-tv.apk`. Updating the TV app
is: change `android-tv/`, bump `VERSION_CODE`/`VERSION_NAME` in `build.sh`, push to main,
then `docker compose pull && docker compose up -d` on the server.

It needs two repository secrets:

- `ANDROID_KEYSTORE_BASE64`: `base64 -w0 keystore/smallhours-tv.jks`
- `ANDROID_KEYSTORE_PASSWORD`: the contents of `keystore/password`

Without them CI warns and the image ships without the APK. `REQUIRE_KEYSTORE=1` makes the
build fail rather than create a new key, which would break updates for installed TVs.
