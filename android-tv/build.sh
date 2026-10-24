#!/usr/bin/env bash
# Build the Smallhours TV APK with the plain Android SDK tools (no Gradle).
#
#   ./build.sh                       -> dist/smallhours-tv.apk
#   TV_URL=https://host/tv ./build.sh   point the app at another server
#   VERSION_CODE=2 VERSION_NAME=1.1 ./build.sh   bump the version for an update
#   PUBLISH=1 ./build.sh             also copy the APK to ../public/download/ (served by the web app)
#
# First run downloads JDK 17 + Android command-line tools (~750 MB) into
# $SMALLHOURS_ANDROID_TOOLS (default ~/.cache/smallhours-android), outside the repo.
set -euo pipefail
cd "$(dirname "$0")"

TOOLS=${SMALLHOURS_ANDROID_TOOLS:-$HOME/.cache/smallhours-android}
TV_URL=${TV_URL:-https://quiz.aldervall.se/tv}
VERSION_CODE=${VERSION_CODE:-1}
VERSION_NAME=${VERSION_NAME:-1.0}
FONT=${FONT:-/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf}
BUILD_TOOLS_VERSION=34.0.0
PLATFORM_VERSION=android-34

# --- Toolchain (downloaded once) ---
mkdir -p "$TOOLS"
if [ ! -x "$TOOLS/jdk/bin/java" ]; then
  echo "Downloading JDK 17..."
  curl -fsSL -o "$TOOLS/jdk.tgz" "https://api.adoptium.net/v3/binary/latest/17/ga/linux/x64/jdk/hotspot/normal/eclipse"
  mkdir -p "$TOOLS/jdk" && tar -xzf "$TOOLS/jdk.tgz" -C "$TOOLS/jdk" --strip-components=1 && rm "$TOOLS/jdk.tgz"
fi
export JAVA_HOME="$TOOLS/jdk" PATH="$TOOLS/jdk/bin:$PATH"

SDKMANAGER="$TOOLS/sdk/cmdline-tools/latest/bin/sdkmanager"
if [ ! -x "$SDKMANAGER" ]; then
  echo "Downloading Android command-line tools..."
  curl -fsSL -o "$TOOLS/cmdline-tools.zip" https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip
  mkdir -p "$TOOLS/sdk/cmdline-tools"
  unzip -q "$TOOLS/cmdline-tools.zip" -d "$TOOLS/sdk/cmdline-tools"
  mv "$TOOLS/sdk/cmdline-tools/cmdline-tools" "$TOOLS/sdk/cmdline-tools/latest"
  rm "$TOOLS/cmdline-tools.zip"
fi
BT="$TOOLS/sdk/build-tools/$BUILD_TOOLS_VERSION"
ANDROID_JAR="$TOOLS/sdk/platforms/$PLATFORM_VERSION/android.jar"
if [ ! -x "$BT/aapt2" ] || [ ! -f "$ANDROID_JAR" ]; then
  echo "Installing Android platform + build tools..."
  yes | "$SDKMANAGER" --sdk_root="$TOOLS/sdk" --licenses >/dev/null || true
  "$SDKMANAGER" --sdk_root="$TOOLS/sdk" "platforms;$PLATFORM_VERSION" "build-tools;$BUILD_TOOLS_VERSION" >/dev/null
fi

# --- Build ---
rm -rf build && mkdir -p build/res build/gen build/classes build/art dist
cp -R res/. build/res/
cat > build/res/values/config.xml <<EOF
<?xml version="1.0" encoding="utf-8"?>
<resources>
    <string name="tv_url" translatable="false">${TV_URL}</string>
</resources>
EOF

echo "Drawing icon + banner..."
javac -d build/art tools/GenArt.java
java -Djava.awt.headless=true -cp build/art GenArt build/res "$FONT"

echo "Linking resources..."
"$BT/aapt2" compile --dir build/res -o build/res.zip
"$BT/aapt2" link -o build/app.unsigned.apk -I "$ANDROID_JAR" \
  --manifest AndroidManifest.xml --java build/gen \
  --min-sdk-version 21 --target-sdk-version 34 \
  --version-code "$VERSION_CODE" --version-name "$VERSION_NAME" \
  build/res.zip

echo "Compiling..."
javac -Xlint:all -Xlint:-options -Werror --release 8 -classpath "$ANDROID_JAR" -d build/classes \
  $(find src build/gen -name '*.java')
"$BT/d8" --release --min-api 21 --lib "$ANDROID_JAR" --output build $(find build/classes -name '*.class')

python3 - <<'EOF'
import zipfile
with zipfile.ZipFile('build/app.unsigned.apk', 'a', zipfile.ZIP_DEFLATED) as apk:
    apk.write('build/classes.dex', 'classes.dex')
EOF
"$BT/zipalign" -p -f 4 build/app.unsigned.apk build/app.aligned.apk

# --- Sign (key is created once; keep keystore/ safe — updates must use the same key) ---
mkdir -p keystore
if [ ! -f keystore/smallhours-tv.jks ]; then
  echo "Creating signing key in android-tv/keystore/ (back it up!)..."
  head -c 24 /dev/urandom | base64 | tr -d '/+=' > keystore/password
  chmod 600 keystore/password
  keytool -genkeypair -keystore keystore/smallhours-tv.jks -alias smallhours -keyalg RSA -keysize 2048 \
    -validity 10000 -storepass:file keystore/password -keypass:file keystore/password \
    -dname "CN=Smallhours TV, O=Small Hours Games" >/dev/null
fi
"$BT/apksigner" sign --ks keystore/smallhours-tv.jks --ks-key-alias smallhours \
  --ks-pass file:keystore/password \
  --out dist/smallhours-tv.apk build/app.aligned.apk
"$BT/apksigner" verify dist/smallhours-tv.apk
rm -f dist/smallhours-tv.apk.idsig

if [ "${PUBLISH:-0}" = "1" ]; then
  mkdir -p ../public/download
  cp dist/smallhours-tv.apk ../public/download/smallhours-tv.apk
  echo "Published to public/download/smallhours-tv.apk"
fi

echo "Built dist/smallhours-tv.apk ($(du -h dist/smallhours-tv.apk | cut -f1)) -> $TV_URL"
