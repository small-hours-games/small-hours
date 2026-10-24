import java.awt.BasicStroke;
import java.awt.Color;
import java.awt.Font;
import java.awt.GradientPaint;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.geom.Area;
import java.awt.geom.Ellipse2D;
import java.awt.geom.RoundRectangle2D;
import java.awt.image.BufferedImage;
import java.io.File;
import javax.imageio.ImageIO;

/**
 * Draws the Smallhours TV launcher icons and TV banner (headless Java2D) into a res/ directory,
 * so the repo holds no binary images. Usage: java GenArt <resDir> [fontFile]
 */
public class GenArt {
    private static final Color SKY_500 = new Color(14, 165, 233);
    private static final Color BLUE_600 = new Color(37, 99, 235);
    private static final Color SLATE_900 = new Color(15, 23, 42);

    public static void main(String[] args) throws Exception {
        File res = new File(args[0]);
        Font font = args.length > 1 && new File(args[1]).exists()
                ? Font.createFont(Font.TRUETYPE_FONT, new File(args[1]))
                : new Font(Font.SANS_SERIF, Font.BOLD, 12);

        String[][] densities = { { "mdpi", "48" }, { "hdpi", "72" }, { "xhdpi", "96" }, { "xxhdpi", "144" }, { "xxxhdpi", "192" } };
        for (String[] d : densities) {
            int size = Integer.parseInt(d[1]);
            write(icon(size), new File(res, "mipmap-" + d[0] + "/ic_launcher.png"));
        }
        // TV home-row banner: 320x180 dp, shipped at xhdpi (640x360 px)
        write(banner(640, 360, font), new File(res, "drawable-xhdpi/banner.png"));
    }

    private static Graphics2D smooth(BufferedImage img) {
        Graphics2D g = img.createGraphics();
        g.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
        g.setRenderingHint(RenderingHints.KEY_TEXT_ANTIALIASING, RenderingHints.VALUE_TEXT_ANTIALIAS_ON);
        g.setRenderingHint(RenderingHints.KEY_RENDERING, RenderingHints.VALUE_RENDER_QUALITY);
        return g;
    }

    /** Rounded sky-to-blue tile with a white gamepad, like the web app's logo. */
    static BufferedImage icon(int size) {
        BufferedImage img = new BufferedImage(size, size, BufferedImage.TYPE_INT_ARGB);
        Graphics2D g = smooth(img);
        drawTile(g, 0, 0, size);
        g.dispose();
        return img;
    }

    static void drawTile(Graphics2D g, double x, double y, double size) {
        double r = size * 0.28;
        g.setPaint(new GradientPaint((float) x, (float) (y + size), SKY_500, (float) (x + size), (float) y, BLUE_600));
        g.fill(new RoundRectangle2D.Double(x, y, size, size, r * 2, r * 2));
        drawGamepad(g, x + size * 0.17, y + size * 0.27, size * 0.66);
    }

    /** White gamepad: body with a cut-out D-pad cross and two buttons. */
    static void drawGamepad(Graphics2D g, double x, double y, double w) {
        double h = w * 0.62;
        Area pad = new Area(new RoundRectangle2D.Double(x, y, w, h, h, h));
        double cx = x + w * 0.29, cy = y + h / 2, arm = h * 0.36, thick = h * 0.15;
        pad.subtract(new Area(new RoundRectangle2D.Double(cx - arm, cy - thick / 2, arm * 2, thick, thick, thick)));
        pad.subtract(new Area(new RoundRectangle2D.Double(cx - thick / 2, cy - arm, thick, arm * 2, thick, thick)));
        double br = h * 0.13;
        pad.subtract(new Area(new Ellipse2D.Double(x + w * 0.70 - br, y + h * 0.36 - br, br * 2, br * 2)));
        pad.subtract(new Area(new Ellipse2D.Double(x + w * 0.80 - br, y + h * 0.62 - br, br * 2, br * 2)));
        g.setColor(Color.WHITE);
        g.fill(pad);
    }

    /** Light sky banner: logo tile, "Smallhours" and a TV pill. */
    static BufferedImage banner(int w, int h, Font base) {
        BufferedImage img = new BufferedImage(w, h, BufferedImage.TYPE_INT_ARGB);
        Graphics2D g = smooth(img);
        g.setPaint(new GradientPaint(0, 0, new Color(240, 249, 255), w, h, new Color(224, 231, 255)));
        g.fillRect(0, 0, w, h);

        double tile = h * 0.42;
        double tx = w * 0.08, ty = (h - tile) / 2;
        drawTile(g, tx, ty, tile);

        Font title = base.deriveFont(Font.BOLD, (float) (h * 0.17));
        g.setFont(title);
        g.setColor(SLATE_900);
        float textX = (float) (tx + tile + w * 0.05);
        float baseline = (float) (h / 2 + title.getSize2D() * 0.10);
        g.drawString("Smallhours", textX, baseline);

        Font pillFont = base.deriveFont(Font.BOLD, (float) (h * 0.085));
        g.setFont(pillFont);
        int pillW = g.getFontMetrics().stringWidth("TV") + (int) (h * 0.12);
        int pillH = (int) (h * 0.13);
        int px = (int) textX, py = (int) (baseline + h * 0.07);
        g.setColor(new Color(2, 132, 199));
        g.fill(new RoundRectangle2D.Double(px, py, pillW, pillH, pillH, pillH));
        g.setColor(Color.WHITE);
        g.drawString("TV", px + (int) (h * 0.06), py + (int) (pillH * 0.76));

        g.setColor(new Color(186, 230, 253));
        g.setStroke(new BasicStroke((float) (h * 0.012)));
        g.drawRect(0, 0, w - 1, h - 1);
        g.dispose();
        return img;
    }

    static void write(BufferedImage img, File out) throws Exception {
        out.getParentFile().mkdirs();
        ImageIO.write(img, "png", out);
    }
}
