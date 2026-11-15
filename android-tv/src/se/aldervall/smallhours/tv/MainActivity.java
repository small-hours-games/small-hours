package se.aldervall.smallhours.tv;

import android.app.Activity;
import android.graphics.Color;
import android.graphics.Typeface;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.text.SpannableString;
import android.text.Spanned;
import android.text.style.ForegroundColorSpan;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

/**
 * Smallhours TV: a fullscreen WebView locked to the host (TV) screen.
 * Loads {@code tv_url} (…/tv), which creates a room and shows /host/CODE?tv=1.
 * Any navigation outside /tv and /host/* is refused and sent back to /tv.
 */
public class MainActivity extends Activity {
    private static final long RETRY_MS = 5000;
    private static final long BACK_EXIT_WINDOW_MS = 2000;

    private static final int NIGHT_NAVY = Color.rgb(11, 21, 48);
    private static final int SPLASH_WHITE = Color.rgb(248, 250, 252);
    private static final int SPLASH_GOLD = Color.rgb(250, 204, 21);
    private static final int SPLASH_MUTED = Color.rgb(148, 163, 184);

    private final Handler handler = new Handler(Looper.getMainLooper());
    private WebView web;
    private LinearLayout overlay;
    private TextView status;
    private Uri entry;
    private boolean pageFailed;
    private long lastBackPress;

    private final Runnable retry = new Runnable() {
        @Override
        public void run() {
            web.loadUrl(entry.toString());
        }
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        entry = Uri.parse(getString(R.string.tv_url));

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(NIGHT_NAVY);

        web = new WebView(this);
        web.setBackgroundColor(NIGHT_NAVY);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        // Music Quiz clips and sound effects must play without anyone touching the TV
        s.setMediaPlaybackRequiresUserGesture(false);
        // Honour the page's viewport width so the TV gets the wide (desktop) layout
        s.setUseWideViewPort(true);
        s.setLoadWithOverviewMode(true);
        web.setWebChromeClient(new WebChromeClient());
        web.setWebViewClient(new HostOnlyClient());
        root.addView(web, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));

        overlay = new LinearLayout(this);
        overlay.setOrientation(LinearLayout.VERTICAL);
        overlay.setGravity(Gravity.CENTER);
        overlay.setBackgroundColor(NIGHT_NAVY);
        int pad = dp(32);
        overlay.setPadding(pad, pad, pad, pad);

        ImageView mark = new ImageView(this);
        mark.setImageResource(R.drawable.splash_mark);
        mark.setContentDescription(getString(R.string.app_name));
        int markSize = dp(128);
        LinearLayout.LayoutParams markParams = new LinearLayout.LayoutParams(markSize, markSize);
        overlay.addView(mark, markParams);

        SpannableString brandText = new SpannableString("Smallhours");
        brandText.setSpan(new ForegroundColorSpan(SPLASH_WHITE), 0, 5, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
        brandText.setSpan(new ForegroundColorSpan(SPLASH_GOLD), 5, 10, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);

        TextView brand = new TextView(this);
        brand.setText(brandText);
        brand.setTypeface(Typeface.DEFAULT_BOLD);
        brand.setTextSize(TypedValue.COMPLEX_UNIT_SP, 34);
        brand.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams brandParams = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        brandParams.topMargin = dp(12);
        overlay.addView(brand, brandParams);

        status = new TextView(this);
        status.setText(R.string.connecting);
        status.setTextColor(SPLASH_MUTED);
        status.setTextSize(TypedValue.COMPLEX_UNIT_SP, 18);
        status.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams statusParams = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        statusParams.topMargin = dp(10);
        overlay.addView(status, statusParams);

        root.addView(overlay, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));

        setContentView(root);
        web.loadUrl(entry.toString());
    }

    private int dp(int value) {
        return Math.round(TypedValue.applyDimension(
                TypedValue.COMPLEX_UNIT_DIP, value, getResources().getDisplayMetrics()));
    }

    /** Only the TV entry page and host screens of our own server. */
    private boolean isAllowed(Uri uri) {
        if (uri == null || !entry.getScheme().equals(uri.getScheme())
                || !entry.getAuthority().equals(uri.getAuthority())) {
            return false;
        }
        String path = uri.getPath() == null ? "" : uri.getPath();
        return path.equals("/tv") || path.equals("/tv/") || path.startsWith("/host/");
    }

    private boolean guard(WebView view, Uri uri) {
        if (isAllowed(uri)) return false;
        view.loadUrl(entry.toString());
        return true;
    }

    private void showOffline() {
        pageFailed = true;
        status.setText(R.string.offline);
        status.setTextColor(SPLASH_WHITE);
        overlay.setVisibility(View.VISIBLE);
        handler.removeCallbacks(retry);
        handler.postDelayed(retry, RETRY_MS);
    }

    private class HostOnlyClient extends WebViewClient {
        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            return guard(view, request.getUrl());
        }

        @Override
        @SuppressWarnings("deprecation")
        public boolean shouldOverrideUrlLoading(WebView view, String url) {
            return guard(view, Uri.parse(url));
        }

        @Override
        public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
            pageFailed = false;
            status.setText(R.string.connecting);
            status.setTextColor(SPLASH_MUTED);
        }

        @Override
        public void onPageFinished(WebView view, String url) {
            if (!pageFailed) overlay.setVisibility(View.GONE);
        }

        @Override
        public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
            if (request.isForMainFrame()) showOffline();
        }

        @Override
        @SuppressWarnings("deprecation")
        public void onReceivedError(WebView view, int errorCode, String description, String failingUrl) {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) showOffline();
        }
    }

    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        // Back never navigates to other pages: press twice to leave the app
        if (keyCode == KeyEvent.KEYCODE_BACK) {
            long now = System.currentTimeMillis();
            if (now - lastBackPress < BACK_EXIT_WINDOW_MS) {
                finish();
            } else {
                lastBackPress = now;
                Toast.makeText(this, R.string.press_back_again, Toast.LENGTH_SHORT).show();
            }
            return true;
        }
        return super.onKeyDown(keyCode, event);
    }

    @Override
    @SuppressWarnings("deprecation") // the flag API is the only option below Android 11 (API 30)
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (!hasFocus) return;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            getWindow().setDecorFitsSystemWindows(false);
            WindowInsetsController insets = getWindow().getInsetsController();
            if (insets != null) {
                insets.hide(WindowInsets.Type.systemBars());
                insets.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
            }
        } else {
            getWindow().getDecorView().setSystemUiVisibility(
                    View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                    | View.SYSTEM_UI_FLAG_FULLSCREEN
                    | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                    | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                    | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                    | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN);
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        web.onResume();
    }

    @Override
    protected void onPause() {
        // Stops music when the app is left (Home button, input switch)
        web.onPause();
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        handler.removeCallbacks(retry);
        web.destroy();
        super.onDestroy();
    }
}
