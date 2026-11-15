import java.awt.BasicStroke;
import java.awt.Color;
import java.awt.GradientPaint;
import java.awt.Graphics2D;
import java.awt.RadialGradientPaint;
import java.awt.RenderingHints;
import java.awt.geom.AffineTransform;
import java.awt.geom.Area;
import java.awt.geom.Ellipse2D;
import java.awt.geom.Path2D;
import java.awt.geom.Point2D;
import java.awt.geom.RoundRectangle2D;
import java.awt.image.BufferedImage;
import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import javax.imageio.ImageIO;

/**
 * Generate Android TV launcher icons (legacy + adaptive), splash mark, and the
 * Night-Navy 16:9 home-screen banner directly from the canonical brand SVG art.
 * Usage: java GenArt <resDir> <brandImagesDir>
 */
public class GenArt {
    private static final Color NIGHT_NAVY = new Color(0x0b, 0x15, 0x30);
    private static final Color NIGHT_MID = new Color(0x13, 0x22, 0x4a);
    private static final Color SKY = new Color(0x38, 0xbd, 0xf8);
    private static final Color VIOLET = new Color(0xa7, 0x8b, 0xfa);
    private static final Color ROSE = new Color(0xfb, 0x71, 0x85);
    private static final Color GOLD = new Color(0xfa, 0xcc, 0x15);

    private static final double[] CARD_ANGLES = { -24.0, -8.0, 8.0, 24.0 };
    private static final Color[] CARD_COLORS = { SKY, VIOLET, ROSE, GOLD };

    private static final String[][] LEGACY_DENSITIES = {
        { "mdpi", "48" },
        { "hdpi", "72" },
        { "xhdpi", "96" },
        { "xxhdpi", "144" },
        { "xxxhdpi", "192" }
    };

    private static final String[][] ADAPTIVE_DENSITIES = {
        { "mdpi", "108" },
        { "hdpi", "162" },
        { "xhdpi", "216" },
        { "xxhdpi", "324" },
        { "xxxhdpi", "432" }
    };

    private static final class VectorPath {
        final Color fill;
        final Path2D.Double shape;

        VectorPath(Color fill, Path2D.Double shape) {
            this.fill = fill;
            this.shape = shape;
        }
    }

    public static void main(String[] args) throws Exception {
        File res = new File(args[0]);
        File brand = new File(args.length > 1 ? args[1] : "../public/images");
        List<VectorPath> wordmark = parseWordmark(new File(brand, "smallhours-logo.svg"));

        // 1. Legacy square-rounded + round launcher icons (mdpi..xxxhdpi)
        for (String[] density : LEGACY_DENSITIES) {
            int size = Integer.parseInt(density[1]);

            BufferedImage launcher = new BufferedImage(size, size, BufferedImage.TYPE_INT_ARGB);
            Graphics2D g = smooth(launcher);
            double arc = size * (28.0 / 64.0);
            g.setColor(NIGHT_NAVY);
            g.fill(new RoundRectangle2D.Double(0, 0, size, size, arc, arc));
            double pad = size * (5.0 / 64.0);
            double markScale = (size / 64.0) * 0.84375;
            drawCardMark(g, pad, pad, markScale);
            g.dispose();
            write(launcher, new File(res, "mipmap-" + density[0] + "/ic_launcher.png"));

            BufferedImage round = new BufferedImage(size, size, BufferedImage.TYPE_INT_ARGB);
            Graphics2D gr = smooth(round);
            gr.setColor(NIGHT_NAVY);
            gr.fill(new Ellipse2D.Double(0, 0, size, size));
            double roundScale = (size / 64.0) * 0.78125;
            drawCardMark(gr, size * 0.5 - 32.0 * roundScale, size * 0.5 - 31.0 * roundScale, roundScale);
            gr.dispose();
            write(round, new File(res, "mipmap-" + density[0] + "/ic_launcher_round.png"));
        }

        // 2. Android 8+ adaptive icon foreground (108dp canvas with safe 66dp inner circle)
        for (String[] density : ADAPTIVE_DENSITIES) {
            int size = Integer.parseInt(density[1]);
            BufferedImage fg = new BufferedImage(size, size, BufferedImage.TYPE_INT_ARGB);
            Graphics2D gf = smooth(fg);
            double markScale = (size * (62.0 / 108.0)) / 64.0;
            drawCardMark(gf, size * 0.5 - 32.0 * markScale, size * 0.5 - 30.5 * markScale, markScale);
            gf.dispose();
            write(fg, new File(res, "mipmap-" + density[0] + "/ic_launcher_foreground.png"));
        }

        // 3. Dark splash / offline screen emblem (transparent 256x256)
        BufferedImage splash = new BufferedImage(256, 256, BufferedImage.TYPE_INT_ARGB);
        Graphics2D gs = smooth(splash);
        double splashScale = 232.0 / 64.0;
        drawCardMark(gs, 128.0 - 32.0 * splashScale, 128.0 - 30.5 * splashScale, splashScale);
        gs.dispose();
        write(splash, new File(res, "drawable-xhdpi/splash_mark.png"));

        // 4. Night-Navy 16:9 Android TV home-screen banner (640x360 xhdpi)
        BufferedImage banner = new BufferedImage(640, 360, BufferedImage.TYPE_INT_ARGB);
        Graphics2D gb = smooth(banner);
        gb.setPaint(new GradientPaint(0, 0, NIGHT_NAVY, 640, 360, NIGHT_MID));
        gb.fillRect(0, 0, 640, 360);

        // Subtle ambient aura behind cards and wordmark
        gb.setPaint(new RadialGradientPaint(
                new Point2D.Float(140f, 180f),
                170f,
                new float[] { 0f, 1f },
                new Color[] { new Color(56, 189, 248, 28), new Color(56, 189, 248, 0) }));
        gb.fillRect(0, 0, 640, 360);

        gb.setPaint(new RadialGradientPaint(
                new Point2D.Float(470f, 185f),
                190f,
                new float[] { 0f, 1f },
                new Color[] { new Color(250, 204, 21, 20), new Color(250, 204, 21, 0) }));
        gb.fillRect(0, 0, 640, 360);

        double logoScale = 500.0 / 280.0;
        double logoX = 70.0;
        double logoY = (360.0 - 64.0 * logoScale) / 2.0 - 3.0;
        drawCardMark(gb, logoX, logoY, logoScale);

        AffineTransform prev = gb.getTransform();
        gb.translate(logoX, logoY);
        gb.scale(logoScale, logoScale);
        for (VectorPath part : wordmark) {
            gb.setColor(part.fill);
            gb.fill(part.shape);
        }
        gb.setTransform(prev);

        // Crisp 4-color bottom edge bar matching the 4 card brand palette
        Color[] barColors = {
            new Color(0x38, 0xbd, 0xf8, 215),
            new Color(0xa7, 0x8b, 0xfa, 215),
            new Color(0xfb, 0x71, 0x85, 215),
            new Color(0xfa, 0xcc, 0x15, 215)
        };
        for (int i = 0; i < 4; i++) {
            gb.setColor(barColors[i]);
            gb.fillRect(i * 160, 354, 160, 6);
        }
        gb.dispose();
        write(banner, new File(res, "drawable-xhdpi/banner.png"));
    }

    private static void drawCardMark(Graphics2D g, double offsetX, double offsetY, double scale) {
        AffineTransform prev = g.getTransform();
        g.translate(offsetX, offsetY);
        g.scale(scale, scale);

        BasicStroke border = new BasicStroke(2.5f, BasicStroke.CAP_ROUND, BasicStroke.JOIN_ROUND);
        RoundRectangle2D.Double card = new RoundRectangle2D.Double(21.0, 10.0, 22.0, 36.0, 10.0, 10.0);

        for (int i = 0; i < 4; i++) {
            AffineTransform cardTx = g.getTransform();
            g.rotate(Math.toRadians(CARD_ANGLES[i]), 32.0, 62.0);
            g.setColor(CARD_COLORS[i]);
            g.fill(card);
            g.setStroke(border);
            g.setColor(NIGHT_NAVY);
            g.draw(card);

            if (i == 3) {
                Area moon = new Area(new Ellipse2D.Double(31.0 - 7.0, 26.0 - 7.0, 14.0, 14.0));
                moon.subtract(new Area(new Ellipse2D.Double(34.3 - 5.9, 23.2 - 5.9, 11.8, 11.8)));
                g.setColor(NIGHT_NAVY);
                g.fill(moon);
            }
            g.setTransform(cardTx);
        }

        g.setTransform(prev);
    }

    private static List<VectorPath> parseWordmark(File svgFile) throws Exception {
        String svg = new String(Files.readAllBytes(svgFile.toPath()), StandardCharsets.UTF_8);
        List<VectorPath> result = new ArrayList<VectorPath>();
        Matcher pathTag = Pattern.compile("<path\\b([^>]+)>").matcher(svg);
        while (pathTag.find()) {
            String attrs = pathTag.group(1);
            String fill = extractAttr(attrs, "fill");
            String d = extractAttr(attrs, "d");
            if (fill != null && d != null) {
                result.add(new VectorPath(parseHex(fill), parseSvgPath(d)));
            }
        }
        if (result.isEmpty()) {
            throw new IllegalStateException("No <path> elements found in " + svgFile);
        }
        return result;
    }

    private static String extractAttr(String attrs, String name) {
        Matcher m = Pattern.compile("\\b" + name + "\\s*=\\s*\"([^\"]+)\"").matcher(attrs);
        return m.find() ? m.group(1) : null;
    }

    private static Color parseHex(String hex) {
        String clean = hex.startsWith("#") ? hex.substring(1) : hex;
        return new Color(Integer.parseInt(clean, 16));
    }

    private static Path2D.Double parseSvgPath(String d) {
        Path2D.Double path = new Path2D.Double(Path2D.WIND_NON_ZERO);
        List<String> tokens = new ArrayList<String>();
        Matcher tok = Pattern.compile("([MmQqVvLlHhZz])|([-+]?(?:\\d*\\.\\d+|\\d+))").matcher(d);
        while (tok.find()) {
            tokens.add(tok.group());
        }

        int i = 0;
        char cmd = 0;
        double curX = 0;
        double curY = 0;
        double startX = 0;
        double startY = 0;

        while (i < tokens.size()) {
            String t = tokens.get(i);
            if (t.length() == 1 && Character.isLetter(t.charAt(0))) {
                cmd = t.charAt(0);
                i++;
                if (cmd == 'Z' || cmd == 'z') {
                    path.closePath();
                    curX = startX;
                    curY = startY;
                }
                continue;
            }

            switch (cmd) {
                case 'M': {
                    curX = Double.parseDouble(tokens.get(i++));
                    curY = Double.parseDouble(tokens.get(i++));
                    path.moveTo(curX, curY);
                    startX = curX;
                    startY = curY;
                    cmd = 'L';
                    break;
                }
                case 'm': {
                    curX += Double.parseDouble(tokens.get(i++));
                    curY += Double.parseDouble(tokens.get(i++));
                    path.moveTo(curX, curY);
                    startX = curX;
                    startY = curY;
                    cmd = 'l';
                    break;
                }
                case 'L': {
                    curX = Double.parseDouble(tokens.get(i++));
                    curY = Double.parseDouble(tokens.get(i++));
                    path.lineTo(curX, curY);
                    break;
                }
                case 'l': {
                    curX += Double.parseDouble(tokens.get(i++));
                    curY += Double.parseDouble(tokens.get(i++));
                    path.lineTo(curX, curY);
                    break;
                }
                case 'H': {
                    curX = Double.parseDouble(tokens.get(i++));
                    path.lineTo(curX, curY);
                    break;
                }
                case 'h': {
                    curX += Double.parseDouble(tokens.get(i++));
                    path.lineTo(curX, curY);
                    break;
                }
                case 'V': {
                    curY = Double.parseDouble(tokens.get(i++));
                    path.lineTo(curX, curY);
                    break;
                }
                case 'v': {
                    curY += Double.parseDouble(tokens.get(i++));
                    path.lineTo(curX, curY);
                    break;
                }
                case 'Q': {
                    double cx = Double.parseDouble(tokens.get(i++));
                    double cy = Double.parseDouble(tokens.get(i++));
                    curX = Double.parseDouble(tokens.get(i++));
                    curY = Double.parseDouble(tokens.get(i++));
                    path.quadTo(cx, cy, curX, curY);
                    break;
                }
                case 'q': {
                    double cx = curX + Double.parseDouble(tokens.get(i++));
                    double cy = curY + Double.parseDouble(tokens.get(i++));
                    curX += Double.parseDouble(tokens.get(i++));
                    curY += Double.parseDouble(tokens.get(i++));
                    path.quadTo(cx, cy, curX, curY);
                    break;
                }
                default:
                    throw new IllegalArgumentException("Unsupported SVG path command: " + cmd);
            }
        }
        return path;
    }

    private static Graphics2D smooth(BufferedImage image) {
        Graphics2D g = image.createGraphics();
        g.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
        g.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BICUBIC);
        g.setRenderingHint(RenderingHints.KEY_RENDERING, RenderingHints.VALUE_RENDER_QUALITY);
        g.setRenderingHint(RenderingHints.KEY_STROKE_CONTROL, RenderingHints.VALUE_STROKE_PURE);
        return g;
    }

    private static void write(BufferedImage image, File output) throws Exception {
        output.getParentFile().mkdirs();
        ImageIO.write(image, "png", output);
    }
}
