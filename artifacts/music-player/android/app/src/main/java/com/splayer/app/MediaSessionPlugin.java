package com.splayer.app;

import android.content.Intent;
import android.graphics.Bitmap;
import android.util.Log;
import android.graphics.BitmapFactory;
import android.media.MediaMetadataRetriever;
import android.net.Uri;
import android.os.Build;
import android.util.Base64;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "MediaSession")
public class MediaSessionPlugin extends Plugin {

    static MediaSessionPlugin instance;

    @Override
    public void load() {
        instance = this;
    }

    @Override
    protected void handleOnDestroy() {
        super.handleOnDestroy();
        if (instance == this) instance = null;
    }

    @PluginMethod
    public void updatePlaybackState(PluginCall call) {
        String  title   = call.getString("title",   "");
        String  artist  = call.getString("artist",  "");
        String  album   = call.getString("album",   "");
        boolean playing = Boolean.TRUE.equals(call.getBoolean("isPlaying", false));
        long    posMs   = longFrom(call, "positionMs");
        long    durMs   = longFrom(call, "durationMs");

        // ── Artwork resolution (primary: native MMR, fallback: base64) ────────
        //
        // For MediaStore tracks, fileUri is a content:// URI.  MediaMetadataRetriever
        // reads the embedded picture directly from the file — no JS fetch/base64
        // round-trip, no size limits, no decode failures.
        //
        // base64 is only used for custom user covers (small images, typically <100 KB).

        String fileUri = call.getString("fileUri", "");
        boolean artLoaded = false;

        if (fileUri != null && !fileUri.isEmpty()) {
            artLoaded = loadArtFromUri(fileUri);
        }

        if (!artLoaded && call.getData().has("artBase64")) {
            String artB64 = call.getString("artBase64", "");
            loadArtFromBase64(artB64);   // sets pendingArtwork + artworkUpdated
        }

        // ── Start / update the foreground service ─────────────────────────────

        Intent intent = new Intent(getContext(), MediaPlaybackService.class);
        intent.setAction(MediaPlaybackService.ACTION_UPDATE);
        intent.putExtra("title",   title);
        intent.putExtra("artist",  artist);
        intent.putExtra("album",   album);
        intent.putExtra("playing", playing);
        intent.putExtra("posMs",   posMs);
        intent.putExtra("durMs",   durMs);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            getContext().startForegroundService(intent);
        } else {
            getContext().startService(intent);
        }

        call.resolve();
    }

    @PluginMethod
    public void stop(PluginCall call) {
        Intent intent = new Intent(getContext(), MediaPlaybackService.class);
        intent.setAction(MediaPlaybackService.ACTION_STOP);
        getContext().startService(intent);
        call.resolve();
    }

    private static final String TAG = "SplayerMedia";

    void onMediaButton(final String action) {
        Log.d(TAG, "onMediaButton: action=" + action);

        // Check bridge / WebView are alive before touching them
        if (getBridge() == null) {
            Log.e(TAG, "onMediaButton: getBridge() is NULL — cannot reach JS");
            return;
        }
        Log.d(TAG, "onMediaButton: using triggerJSEvent, action=" + action);
        getBridge().triggerJSEvent("splayerMediaButton", "window",
            "{\"detail\":{\"action\":\"" + action + "\"}}");
        Log.d(TAG, "onMediaButton: triggerJSEvent done");
    }

    // ── Art loading helpers ───────────────────────────────────────────────────

    /**
     * Loads embedded album art from a content:// or file:// URI using
     * MediaMetadataRetriever.  Returns true if art was successfully loaded.
     */
    private boolean loadArtFromUri(String uriString) {
        MediaMetadataRetriever mmr = new MediaMetadataRetriever();
        try {
            Uri uri = Uri.parse(uriString);
            String scheme = uri.getScheme();
            if ("content".equals(scheme) || "file".equals(scheme)) {
                mmr.setDataSource(getContext(), uri);
            } else {
                // Not a local URI we can read
                return false;
            }

            byte[] artBytes = mmr.getEmbeddedPicture();
            if (artBytes == null || artBytes.length == 0) return false;

            Bitmap bmp = BitmapFactory.decodeByteArray(artBytes, 0, artBytes.length);
            if (bmp == null) return false;

            // Resize to at most 512 px on the shorter side
            int w = bmp.getWidth(), h = bmp.getHeight();
            int maxSide = 512;
            if (w > maxSide || h > maxSide) {
                float scale = maxSide / (float) Math.max(w, h);
                bmp = Bitmap.createScaledBitmap(bmp,
                    Math.round(w * scale), Math.round(h * scale), true);
            }

            MediaPlaybackService.pendingArtwork = bmp;
            MediaPlaybackService.artworkUpdated = true;
            return true;

        } catch (Exception ignored) {
            return false;
        } finally {
            try { mmr.release(); } catch (Exception ignored) {}
        }
    }

    /**
     * Decodes a base64 artwork string (for custom user covers).
     * An empty string explicitly clears the artwork.
     */
    private void loadArtFromBase64(String artB64) {
        Bitmap bmp = null;
        if (artB64 != null && !artB64.isEmpty()) {
            try {
                byte[] raw = Base64.decode(artB64, Base64.DEFAULT);
                bmp = BitmapFactory.decodeByteArray(raw, 0, raw.length);
                if (bmp != null) {
                    int w = bmp.getWidth(), h = bmp.getHeight();
                    int maxSide = 512;
                    if (w > maxSide || h > maxSide) {
                        float scale = maxSide / (float) Math.max(w, h);
                        bmp = Bitmap.createScaledBitmap(bmp,
                            Math.round(w * scale), Math.round(h * scale), true);
                    }
                }
            } catch (Exception ignored) {}
        }
        MediaPlaybackService.pendingArtwork = bmp;
        MediaPlaybackService.artworkUpdated = true;
    }

    // ── Misc helpers ──────────────────────────────────────────────────────────

    private static long longFrom(PluginCall call, String key) {
        Object v = call.getData().opt(key);
        if (v instanceof Long)    return (Long) v;
        if (v instanceof Integer) return ((Integer) v).longValue();
        if (v instanceof Double)  return ((Double) v).longValue();
        return 0L;
    }
}
