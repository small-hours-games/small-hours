import java.awt.Color;
import java.awt.GradientPaint;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.io.File;
import javax.imageio.ImageIO;

/** Fit the approved web logo into Android launcher icons and the TV banner.
 * Usage: java GenArt <resDir> <brandImagesDir>
 */
public class GenArt {
    public static void main(String[] args) throws Exception {
        File res = new File(args[0]);
        File brand = new File(args.length > 1 ? args[1] : "../public/images");
        BufferedImage icon = ImageIO.read(new File(brand, "smallhours-icon.png"));
        BufferedImage logo = ImageIO.read(new File(brand, "smallhours-logo.png"));
        String[][] densities = { { "mdpi", "48" }, { "hdpi", "72" }, { "xhdpi", "96" }, { "xxhdpi", "144" }, { "xxxhdpi", "192" } };
        for (String[] density : densities) {
            int size = Integer.parseInt(density[1]);
            BufferedImage result = new BufferedImage(size, size, BufferedImage.TYPE_INT_ARGB);
            Graphics2D g = smooth(result);
            g.drawImage(icon, 0, 0, size, size, null);
            g.dispose();
            write(result, new File(res, "mipmap-" + density[0] + "/ic_launcher.png"));
        }
        BufferedImage banner = new BufferedImage(640, 360, BufferedImage.TYPE_INT_ARGB);
        Graphics2D g = smooth(banner);
        g.setPaint(new GradientPaint(0, 0, new Color(240, 249, 255), 640, 360, new Color(224, 231, 255)));
        g.fillRect(0, 0, 640, 360);
        int width = 560, height = (int) Math.round(width * (double) logo.getHeight() / logo.getWidth());
        g.drawImage(logo, 40, (360 - height) / 2, width, height, null);
        g.dispose();
        write(banner, new File(res, "drawable-xhdpi/banner.png"));
    }
    private static Graphics2D smooth(BufferedImage image) {
        Graphics2D g = image.createGraphics();
        g.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BICUBIC);
        g.setRenderingHint(RenderingHints.KEY_RENDERING, RenderingHints.VALUE_RENDER_QUALITY);
        return g;
    }
    private static void write(BufferedImage image, File output) throws Exception {
        output.getParentFile().mkdirs();
        ImageIO.write(image, "png", output);
    }
}
