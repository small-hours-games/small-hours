import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

function readRepoFile(relPath) {
  return readFileSync(new URL(`../../${relPath}`, import.meta.url), 'utf8');
}

describe('Android TV Night-Navy rebrand & art generation', () => {
  it('configures adaptive icons, round icon, and Night-Navy theme in AndroidManifest and XML resources', () => {
    const manifest = readRepoFile('android-tv/AndroidManifest.xml');
    expect(manifest).toContain('android:icon="@mipmap/ic_launcher"');
    expect(manifest).toContain('android:roundIcon="@mipmap/ic_launcher_round"');
    expect(manifest).toContain('android:banner="@drawable/banner"');
    expect(manifest).toContain('android:theme="@style/Theme.Smallhours.TV"');

    const adaptiveLauncher = readRepoFile('android-tv/res/mipmap-anydpi-v26/ic_launcher.xml');
    const adaptiveRound = readRepoFile('android-tv/res/mipmap-anydpi-v26/ic_launcher_round.xml');
    for (const xml of [adaptiveLauncher, adaptiveRound]) {
      expect(xml).toContain('<background android:drawable="@color/ic_launcher_background" />');
      expect(xml).toContain('<foreground android:drawable="@mipmap/ic_launcher_foreground" />');
    }

    const colors = readRepoFile('android-tv/res/values/colors.xml');
    expect(colors).toContain('<color name="ic_launcher_background">#0b1530</color>');
    expect(colors).toContain('<color name="night_navy">#0b1530</color>');
    expect(colors).toContain('<color name="splash_accent">#facc15</color>');

    const styles = readRepoFile('android-tv/res/values/styles.xml');
    expect(styles).toContain('name="Theme.Smallhours.TV"');
    expect(styles).toContain('android:windowBackground">@color/night_navy');

    const strings = readRepoFile('android-tv/res/values/strings.xml');
    expect(strings).toContain('name="connecting"');
    expect(strings).toContain('name="offline"');
  });

  it('parses every SVG path command in public/images/smallhours-logo.svg and emits all Night-Navy TV & adaptive assets in GenArt.java', () => {
    const genArt = readRepoFile('android-tv/tools/GenArt.java');
    const svg = readRepoFile('public/images/smallhours-logo.svg');

    // GenArt must read smallhours-logo.svg and never fall back to legacy smallhours-logo.png or light sky gradient
    expect(genArt).toContain('"smallhours-logo.svg"');
    expect(genArt).not.toContain('smallhours-logo.png');
    expect(genArt).not.toContain('240, 249, 255');

    // Verify all densities and deliverables are generated
    for (const density of ['mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi']) {
      expect(genArt).toContain(`"${density}"`);
    }
    expect(genArt).toContain('/ic_launcher.png');
    expect(genArt).toContain('/ic_launcher_round.png');
    expect(genArt).toContain('/ic_launcher_foreground.png');
    expect(genArt).toContain('drawable-xhdpi/splash_mark.png');
    expect(genArt).toContain('drawable-xhdpi/banner.png');
    expect(genArt).toContain('new BufferedImage(640, 360, BufferedImage.TYPE_INT_ARGB)');

    // Every <path> command in smallhours-logo.svg must have a matching case in GenArt.parseSvgPath
    const paths = [...svg.matchAll(/<path[^>]*fill="([^"]+)"[^>]*d="([^"]+)"/g)];
    expect(paths.length).toBe(2);
    expect(paths.map((m) => m[1])).toEqual(['#f8fafc', '#facc15']);

    const usedCommands = new Set(paths.flatMap(([, , d]) => d.match(/[A-Za-z]/g) || []));
    for (const cmd of usedCommands) {
      if (cmd === 'Z' || cmd === 'z') {
        expect(genArt).toContain(`cmd == '${cmd}'`);
      } else {
        expect(genArt).toContain(`case '${cmd}':`);
      }
    }
  });

  it('aligns MainActivity splash & offline view to Night-Navy branding', () => {
    const activity = readRepoFile('android-tv/src/se/aldervall/smallhours/tv/MainActivity.java');
    expect(activity).toContain('Color.rgb(11, 21, 48)');
    expect(activity).toContain('R.drawable.splash_mark');
    expect(activity).toContain('R.string.connecting');
    expect(activity).toContain('R.string.offline');
    expect(activity).not.toContain('Color.rgb(224, 242, 254)');
  });

  it('bumps Android TV and package versions cleanly', () => {
    const buildSh = readRepoFile('android-tv/build.sh');
    expect(buildSh).toContain('VERSION_CODE=${VERSION_CODE:-4}');
    expect(buildSh).toContain('VERSION_NAME=${VERSION_NAME:-1.3}');

    const pkg = JSON.parse(readRepoFile('package.json'));
    const [major, minor] = pkg.version.split('.').map(Number);
    expect(major).toBeGreaterThanOrEqual(2);
    expect(minor).toBeGreaterThanOrEqual(38);
  });
});
