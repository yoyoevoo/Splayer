package com.splayer.app;

import android.os.Build;
import android.os.Bundle;
import android.util.Log;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.plugin.http.Http;
import android.webkit.WebView;

public class MainActivity extends BridgeActivity {

    private static final String TAG = "SplayerMedia";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(SplayerPlugin.class);
        registerPlugin(YtDownloadPlugin.class);
        registerPlugin(MediaSessionPlugin.class);
        registerPlugin(AudioEffectPlugin.class);
        registerPlugin(Http.class);
        super.onCreate(savedInstanceState);
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);

        // POST_NOTIFICATIONS is a runtime permission on Android 13+ (API 33).
        // Without it, the foreground service notification is silently suppressed —
        // the service runs but no notification appears.
        if (Build.VERSION.SDK_INT >= 33) {
            if (checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS)
                    != android.content.pm.PackageManager.PERMISSION_GRANTED) {
                Log.d(TAG, "POST_NOTIFICATIONS not granted — requesting now");
                requestPermissions(
                    new String[]{ android.Manifest.permission.POST_NOTIFICATIONS }, 1001);
            } else {
                Log.d(TAG, "POST_NOTIFICATIONS already granted");
            }
        }
    }
}
