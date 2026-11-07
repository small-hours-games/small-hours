import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.io.File;
import javax.imageio.ImageIO;

/** Crop and resize the approved PNG without redrawing its artwork.
 * Run: java scripts/PrepareBrandAssets.java [images directory]
 */
class PrepareBrandAssets {
    public static void main(String[] args) throws Exception {
        File directory = new File(args.length > 0 ? args[0] : "public/images");
        BufferedImage source = ImageIO.read(new File(directory, "smallhours-logo-concept-v1.png"));
        int left = source.getWidth(), top = source.getHeight(), right = 0, bottom = 0;
        for (int y = 0; y < source.getHeight(); y++) for (int x = 0; x < source.getWidth(); x++) {
            if ((source.getRGB(x, y) >>> 24) > 16) {
                left = Math.min(left, x); right = Math.max(right, x);
                top = Math.min(top, y); bottom = Math.max(bottom, y);
            }
        }
        // The icon and wordmark are separated by transparent columns.
        int split = -1;
        for (int x = left; x <= right; x++) {
            boolean blank = true;
            for (int y = top; y <= bottom; y++) if ((source.getRGB(x, y) >>> 24) > 16) { blank = false; break; }
            if (blank) { split = x; break; }
        }
        if (split < left + 100) throw new IllegalStateException("Could not isolate logo symbol");
        BufferedImage logo = source.getSubimage(left, top, right - left + 1, bottom - top + 1);
        BufferedImage icon = source.getSubimage(left, top, split - left, bottom - top + 1);
        saveFit(logo, new File(directory, "smallhours-logo.png"), 1400,
                (int) Math.round(1400.0 * logo.getHeight() / logo.getWidth()), 0);
        saveFit(icon, new File(directory, "smallhours-icon.png"), 512, 512, 28);
        saveFit(icon, new File(directory, "smallhours-favicon.png"), 64, 64, 3);
        System.out.println("Prepared full logo and icons from approved artwork.");
    }
    static void saveFit(BufferedImage source, File file, int width, int height, int padding) throws Exception {
        BufferedImage result = new BufferedImage(width, height, BufferedImage.TYPE_INT_ARGB);
        double scale = Math.min((width - padding * 2.0) / source.getWidth(), (height - padding * 2.0) / source.getHeight());
        int w = (int) Math.round(source.getWidth() * scale), h = (int) Math.round(source.getHeight() * scale);
        Graphics2D g = result.createGraphics();
        g.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BICUBIC);
        g.drawImage(source, (width - w) / 2, (height - h) / 2, w, h, null);
        g.dispose();
        ImageIO.write(result, "png", file);
    }
}
