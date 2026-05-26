package com.splayer.app;

import android.Manifest;
import android.content.ContentResolver;
import android.content.ContentUris;
import android.database.Cursor;
import android.media.MediaMetadataRetriever;
import android.net.Uri;
import android.os.Build;
import android.provider.MediaStore;
import android.util.Base64;
import android.util.Log;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;

@CapacitorPlugin(
    name = "Splayer",
    permissions = {
        @Permission(
            strings = { Manifest.permission.READ_EXTERNAL_STORAGE },
            alias = "readStorage"
        ),
        // READ_MEDIA_AUDIO is the replacement on API 33+
        @Permission(
            strings = { "android.permission.READ_MEDIA_AUDIO" },
            alias = "readAudio"
        )
    }
)
public class SplayerPlugin extends Plugin {

    // ── scan ─────────────────────────────────────────────────────────────────

    @PluginMethod
    public void scan(PluginCall call) {
        if (call == null) return;
        String alias = Build.VERSION.SDK_INT >= 33 ? "readAudio" : "readStorage";
        if (getPermissionState(alias) != PermissionState.GRANTED) {
            requestPermissionForAlias(alias, call, "scanPermissionCallback");
            return;
        }
        performScan(call);
    }

    @PermissionCallback
    private void scanPermissionCallback(PluginCall call) {
        boolean granted =
            getPermissionState("readAudio") == PermissionState.GRANTED ||
            getPermissionState("readStorage") == PermissionState.GRANTED;
        if (!granted) {
            call.reject("Storage permission denied");
            return;
        }
        performScan(call);
    }

    // Messaging-app folder segments to exclude (lower-case, matched against full path)
    private static final String[] MESSAGING_DIRS = {
        "whatsapp", "telegram", "signal", "messenger", "viber",
        "wechat", "discord", "snapchat", "line/received",
    };

    // Voice-message filename prefixes / substrings (lower-case)
    private static final String[] VOICE_NAME_PATTERNS = {
        "ptt-", "ptt_", "voice_msg", "voicenote", "voice note",
        "audio note", "audio_note", "aud_", "msg_audio",
    };

    private boolean isVoiceMessage(String path, String name, long durationMs, long size) {
        String lpath = path  != null ? path.toLowerCase()  : "";
        String lname = name  != null ? name.toLowerCase()  : "";

        // 1. Path contains a known messaging-app folder
        for (String dir : MESSAGING_DIRS) {
            if (lpath.contains(dir)) return true;
        }

        // 2. Filename matches a voice-note naming pattern
        for (String pat : VOICE_NAME_PATTERNS) {
            if (lname.contains(pat)) return true;
        }

        // 3. File is short (< 30 s) AND small (< 500 KB) — catches unlabelled voice notes
        if (durationMs > 0 && durationMs < 30_000 && size < 512_000) return true;

        // 4. Extremely short regardless of size (< 10 s) — sound effects / ringtones / junk
        if (durationMs > 0 && durationMs < 10_000) return true;

        return false;
    }

    @SuppressWarnings("deprecation")   // DATA column: deprecated for file I/O but fine for path strings
    private void performScan(PluginCall call) {
        String[] projection = {
            MediaStore.Audio.Media._ID,
            MediaStore.Audio.Media.DISPLAY_NAME,
            MediaStore.Audio.Media.SIZE,
            MediaStore.Audio.Media.TITLE,
            MediaStore.Audio.Media.ARTIST,
            MediaStore.Audio.Media.ALBUM,
            MediaStore.Audio.Media.DURATION,
            MediaStore.Audio.Media.DATA,          // full file path for folder-name checks
        };

        ContentResolver resolver = getContext().getContentResolver();
        try (Cursor cursor = resolver.query(
            MediaStore.Audio.Media.EXTERNAL_CONTENT_URI,
            projection,
            null, null,
            MediaStore.Audio.Media.DATE_ADDED + " DESC"
        )) {
            JSArray files = new JSArray();
            if (cursor != null) {
                int idCol       = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media._ID);
                int nameCol     = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.DISPLAY_NAME);
                int sizeCol     = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.SIZE);
                int titleCol    = cursor.getColumnIndex(MediaStore.Audio.Media.TITLE);
                int artistCol   = cursor.getColumnIndex(MediaStore.Audio.Media.ARTIST);
                int albumCol    = cursor.getColumnIndex(MediaStore.Audio.Media.ALBUM);
                int durationCol = cursor.getColumnIndex(MediaStore.Audio.Media.DURATION);
                int dataCol     = cursor.getColumnIndex(MediaStore.Audio.Media.DATA);

                while (cursor.moveToNext()) {
                    long   id       = cursor.getLong(idCol);
                    String name     = cursor.getString(nameCol);
                    long   size     = cursor.getLong(sizeCol);
                    long   duration = durationCol >= 0 ? cursor.getLong(durationCol) : 0;
                    String path     = dataCol     >= 0 ? cursor.getString(dataCol)   : "";

                    // Skip voice messages and messaging-app audio
                    if (isVoiceMessage(path, name, duration, size)) continue;

                    String title    = titleCol    >= 0 ? cursor.getString(titleCol)    : null;
                    String artist   = artistCol   >= 0 ? cursor.getString(artistCol)   : null;
                    String album    = albumCol    >= 0 ? cursor.getString(albumCol)    : null;

                    Uri contentUri = ContentUris.withAppendedId(
                        MediaStore.Audio.Media.EXTERNAL_CONTENT_URI, id
                    );
                    // Prefer the absolute file path so Capacitor serves it via _capacitor_file_,
                    // which supports HTTP Range requests. content:// via _capacitor_content_ does not.
                    String uriStr = (path != null && !path.isEmpty())
                        ? "file://" + path
                        : contentUri.toString();

                    JSObject entry = new JSObject();
                    entry.put("uri",        uriStr);
                    entry.put("name",       name   != null ? name   : "Unknown");
                    entry.put("size",       size);
                    entry.put("title",      title  != null ? title  : "");
                    entry.put("artist",     artist != null ? artist : "");
                    entry.put("album",      album  != null ? album  : "");
                    entry.put("durationMs", duration);
                    files.put(entry);
                }
            }
            JSObject result = new JSObject();
            result.put("files", files);
            call.resolve(result);
        } catch (Exception e) {
            call.reject("Scan failed: " + e.getMessage());
        }
    }

    // ── readFile ──────────────────────────────────────────────────────────────

    @PluginMethod
    public void readFile(PluginCall call) {
        if (call == null) return;
        String uriString = call.getString("uri");
        if (uriString == null || uriString.isEmpty()) {
            call.reject("uri is required");
            return;
        }

        try {
            Uri uri = Uri.parse(uriString);
            ContentResolver resolver = getContext().getContentResolver();

            try (InputStream is = resolver.openInputStream(uri);
                 ByteArrayOutputStream bos = new ByteArrayOutputStream()) {

                if (is == null) {
                    call.reject("Cannot open file: " + uriString);
                    return;
                }

                byte[] buf = new byte[65536];
                int n;
                while ((n = is.read(buf)) != -1) {
                    bos.write(buf, 0, n);
                }

                byte[] bytes  = bos.toByteArray();
                String base64 = Base64.encodeToString(bytes, Base64.NO_WRAP);

                // Extract filename from the URI path segment
                String path = uri.getLastPathSegment();
                String name = (path != null) ? path : uriString;

                JSObject result = new JSObject();
                result.put("base64", base64);
                result.put("name",   name);
                result.put("size",   bytes.length);
                call.resolve(result);
            }
        } catch (Exception e) {
            call.reject("Read failed: " + e.getMessage());
        }
    }

    // ── getAlbumArt ───────────────────────────────────────────────────────────
    // Reads the embedded picture from a content:// or file:// URI using
    // MediaMetadataRetriever.  Returns base64-encoded JPEG bytes, or "" if the
    // file has no embedded art.  Runs on a background thread to avoid ANR.

    @PluginMethod
    public void getAlbumArt(PluginCall call) {
        String uriString = call.getString("uri", "");
        if (uriString == null || uriString.isEmpty()) {
            call.reject("uri is required");
            return;
        }
        final String finalUri = uriString;
        new Thread(() -> {
            MediaMetadataRetriever mmr = new MediaMetadataRetriever();
            try {
                Uri uri = Uri.parse(finalUri);
                String scheme = uri.getScheme();
                if ("content".equals(scheme) || "file".equals(scheme)) {
                    mmr.setDataSource(getContext(), uri);
                } else {
                    call.reject("Unsupported URI scheme: " + scheme);
                    return;
                }
                byte[] art = mmr.getEmbeddedPicture();
                JSObject result = new JSObject();
                result.put("base64", (art != null && art.length > 0)
                    ? Base64.encodeToString(art, Base64.NO_WRAP)
                    : "");
                call.resolve(result);
            } catch (Exception e) {
                Log.w("SplayerPlugin", "getAlbumArt failed for " + finalUri + ": " + e.getMessage());
                JSObject result = new JSObject();
                result.put("base64", "");
                call.resolve(result);
            } finally {
                try { mmr.release(); } catch (Exception ignored) {}
            }
        }).start();
    }

    // ── openEqualizer ─────────────────────────────────────────────────────────

    @PluginMethod
    public void openEqualizer(PluginCall call) {
        try {
            android.content.Intent intent = new android.content.Intent(
                android.media.audiofx.AudioEffect.ACTION_DISPLAY_AUDIO_EFFECT_CONTROL_PANEL);
            intent.putExtra(android.media.audiofx.AudioEffect.EXTRA_PACKAGE_NAME,
                getContext().getPackageName());
            intent.putExtra(android.media.audiofx.AudioEffect.EXTRA_CONTENT_TYPE,
                android.media.audiofx.AudioEffect.CONTENT_TYPE_MUSIC);
            intent.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve();
        } catch (android.content.ActivityNotFoundException e) {
            call.reject("No system equalizer found on this device");
        } catch (Exception e) {
            call.reject("Failed to open equalizer: " + e.getMessage());
        }
    }

    // ── deleteFile ────────────────────────────────────────────────────────────

    @PluginMethod
    public void deleteFile(PluginCall call) {
        if (call == null) return;
        String uriString = call.getString("uri");
        if (uriString == null || uriString.isEmpty()) {
            call.reject("uri is required");
            return;
        }

        try {
            Uri uri = Uri.parse(uriString);
            ContentResolver resolver = getContext().getContentResolver();
            int deleted = resolver.delete(uri, null, null);

            JSObject result = new JSObject();
            result.put("success", deleted > 0);
            call.resolve(result);
        } catch (Exception e) {
            call.reject("Delete failed: " + e.getMessage());
        }
    }
}
