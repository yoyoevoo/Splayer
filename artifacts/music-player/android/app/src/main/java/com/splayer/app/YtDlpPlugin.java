package com.splayer.app;

import android.media.MediaScannerConnection;
import android.os.Build;
import android.os.Environment;
import android.util.Base64;
import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.BufferedReader;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStreamReader;
import java.util.ArrayList;
import java.util.List;

@CapacitorPlugin(name = "YtDlp")
public class YtDlpPlugin extends Plugin {

    private static final String TAG = "YtDlpPlugin";
    private volatile boolean binaryAvailable = false;

    @Override
    public void load() {
        new Thread(this::checkBinary).start();
    }

    private void checkBinary() {
        try {
            String srcPath = getContext().getApplicationInfo().nativeLibraryDir + "/libytdlp.so";
            if (!new File(srcPath).exists()) {
                Log.e(TAG, "yt-dlp binary not found — fallback unavailable. Expected: " + srcPath);
                return;
            }
            File bin = ensureBinary();
            Process proc = new ProcessBuilder(bin.getAbsolutePath(), "--version")
                .redirectErrorStream(true)
                .start();
            StringBuilder sb = new StringBuilder();
            try (BufferedReader r = new BufferedReader(new InputStreamReader(proc.getInputStream()))) {
                String line;
                while ((line = r.readLine()) != null) sb.append(line);
            }
            int exit = proc.waitFor();
            if (exit == 0) {
                binaryAvailable = true;
                Log.d(TAG, "yt-dlp ready: " + sb.toString().trim());
            } else {
                Log.e(TAG, "yt-dlp --version exited " + exit + " — binary may be corrupt");
            }
        } catch (Exception e) {
            Log.e(TAG, "yt-dlp startup check failed: " + e.getMessage());
        }
    }

    // ── Binary setup ──────────────────────────────────────────────────────────

    /** Copies binary from nativeLibraryDir to filesDir and returns the stable path. */
    private File ensureBinary() throws Exception {
        File dest = new File(getContext().getFilesDir(), "ytdlp");
        if (!dest.exists() || dest.length() == 0) {
            String src = getContext().getApplicationInfo().nativeLibraryDir + "/libytdlp.so";
            Log.d(TAG, "Copying binary from " + src + " to " + dest.getAbsolutePath());
            try (FileInputStream in  = new FileInputStream(src);
                 FileOutputStream out = new FileOutputStream(dest)) {
                byte[] buf = new byte[65536];
                int n;
                while ((n = in.read(buf)) != -1) out.write(buf, 0, n);
            }
        }
        dest.setExecutable(true, false);
        Log.d(TAG, "Using yt-dlp at: " + dest.getAbsolutePath() + " size=" + dest.length());
        return dest;
    }

    private File saveDir() {
        File dir;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            File extDir = getContext().getExternalFilesDir(Environment.DIRECTORY_MUSIC);
            dir = new File(extDir != null ? extDir : getContext().getFilesDir(), "Splayer Downloads");
        } else {
            dir = new File(Environment.getExternalStoragePublicDirectory(
                           Environment.DIRECTORY_MUSIC), "Splayer Downloads");
        }
        if (!dir.exists()) dir.mkdirs();
        return dir;
    }

    private File ensureDenoIfAvailable() {
        try {
            String srcPath = getContext().getApplicationInfo().nativeLibraryDir + "/libdeno.so";
            if (!new File(srcPath).exists()) return null;
            File dest = new File(getContext().getFilesDir(), "deno");
            if (!dest.exists() || dest.length() == 0) {
                Log.d(TAG, "Copying Deno runtime from " + srcPath);
                try (FileInputStream in  = new FileInputStream(srcPath);
                     FileOutputStream out = new FileOutputStream(dest)) {
                    byte[] buf = new byte[65536]; int n;
                    while ((n = in.read(buf)) != -1) out.write(buf, 0, n);
                }
            }
            dest.setExecutable(true, false);
            Log.d(TAG, "Deno runtime available at: " + dest.getAbsolutePath());
            return dest;
        } catch (Exception e) {
            Log.w(TAG, "Deno not available: " + e.getMessage());
            return null;
        }
    }

    // ── downloadAudio ─────────────────────────────────────────────────────────

    @PluginMethod
    public void downloadAudio(PluginCall call) {
        call.setKeepAlive(true);
        JSObject data = call.getData();
        if (data == null) { call.reject("null data"); return; }
        final String urlRaw = call.getString("url", "");
        if (urlRaw.isEmpty()) { call.reject("missing url"); return; }
        final String url = urlRaw.trim();

        new Thread(() -> {
            try {
                if (!binaryAvailable) {
                    call.reject("yt-dlp binary not found — fallback unavailable");
                    return;
                }
                File bin    = ensureBinary();
                File outDir = saveDir();

                List<String> cmd = new ArrayList<>();
                cmd.add(bin.getAbsolutePath());

                File deno = ensureDenoIfAvailable();
                if (deno != null) {
                    cmd.add("--extractor-args");
                    cmd.add("youtube:player_client=android");
                    cmd.add("--js-runtimes");
                    cmd.add("deno:" + deno.getAbsolutePath());
                }

                cmd.add("-x");
                cmd.add("--audio-format"); cmd.add("mp3");
                cmd.add("--audio-quality"); cmd.add("0");
                cmd.add("-o"); cmd.add(outDir.getAbsolutePath() + "/%(title)s.%(ext)s");
                cmd.add("--no-playlist");
                cmd.add("--newline");
                cmd.add("--no-colors");
                cmd.add(url);

                ProcessBuilder pb = new ProcessBuilder(cmd);
                pb.environment().put("HOME", getContext().getFilesDir().getAbsolutePath());
                pb.environment().put("TMPDIR", getContext().getCacheDir().getAbsolutePath());
                pb.redirectErrorStream(true);
                Process proc = pb.start();

                String outputPath = drainWithProgress(proc, call);
                int exitCode = proc.waitFor();

                if (exitCode != 0) {
                    call.reject("yt-dlp exited " + exitCode);
                    return;
                }

                if (outputPath == null) {
                    call.reject("yt-dlp finished but no output file detected");
                    return;
                }

                File outFile = new File(outputPath);
                MediaScannerConnection.scanFile(getContext(),
                    new String[]{ outFile.getAbsolutePath() }, null, null);

                String base64 = fileToBase64(outFile);
                String title  = outFile.getName().replaceAll("\\.mp3$", "");

                JSObject ret = new JSObject();
                ret.put("base64",   base64);
                ret.put("ext",      "mp3");
                ret.put("mimeType", "audio/mpeg");
                ret.put("title",    title);
                ret.put("author",   "Unknown");
                ret.put("path",     outFile.getAbsolutePath());
                call.resolve(ret);

            } catch (Exception e) {
                Log.e(TAG, "downloadAudio", e);
                call.reject("yt-dlp failed: " + e.getMessage());
            }
        }).start();
    }

    // ── downloadVideo ─────────────────────────────────────────────────────────

    @PluginMethod
    public void downloadVideo(PluginCall call) {
        call.setKeepAlive(true);
        JSObject data = call.getData();
        if (data == null) { call.reject("null data"); return; }
        final String urlRaw = call.getString("url", "");
        if (urlRaw.isEmpty()) { call.reject("missing url"); return; }
        final String url     = urlRaw.trim();
        final String quality = call.getString("quality", "720");

        new Thread(() -> {
            try {
                if (!binaryAvailable) {
                    call.reject("yt-dlp binary not found — fallback unavailable");
                    return;
                }
                File bin    = ensureBinary();
                File outDir = saveDir();

                List<String> cmd = new ArrayList<>();
                cmd.add(bin.getAbsolutePath());

                File deno = ensureDenoIfAvailable();
                if (deno != null) {
                    cmd.add("--extractor-args");
                    cmd.add("youtube:player_client=android");
                    cmd.add("--js-runtimes");
                    cmd.add("deno:" + deno.getAbsolutePath());
                }

                cmd.add("-f");
                cmd.add("bestvideo[height<=" + quality + "]+bestaudio/best[height<=" + quality + "]");
                cmd.add("--merge-output-format"); cmd.add("mp4");
                cmd.add("-o"); cmd.add(outDir.getAbsolutePath() + "/%(title)s.%(ext)s");
                cmd.add("--no-playlist");
                cmd.add("--newline");
                cmd.add("--no-colors");
                cmd.add(url);

                ProcessBuilder pb = new ProcessBuilder(cmd);
                pb.environment().put("HOME", getContext().getFilesDir().getAbsolutePath());
                pb.environment().put("TMPDIR", getContext().getCacheDir().getAbsolutePath());
                pb.redirectErrorStream(true);
                Process proc = pb.start();

                String outputPath = drainWithProgress(proc, call);
                int exitCode = proc.waitFor();

                if (exitCode != 0) {
                    call.reject("yt-dlp exited " + exitCode);
                    return;
                }
                if (outputPath == null) {
                    call.reject("yt-dlp finished but no output file detected");
                    return;
                }

                File outFile = new File(outputPath);
                MediaScannerConnection.scanFile(getContext(),
                    new String[]{ outFile.getAbsolutePath() }, null, null);

                String base64 = fileToBase64(outFile);
                String title  = outFile.getName().replaceAll("\\.mp4$", "");

                JSObject ret = new JSObject();
                ret.put("base64",   base64);
                ret.put("ext",      "mp4");
                ret.put("mimeType", "video/mp4");
                ret.put("title",    title);
                ret.put("author",   "Unknown");
                ret.put("path",     outFile.getAbsolutePath());
                call.resolve(ret);

            } catch (Exception e) {
                Log.e(TAG, "downloadVideo", e);
                call.reject("yt-dlp failed: " + e.getMessage());
            }
        }).start();
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    /** Read stdout line-by-line, fire progress events, return last detected output path. */
    private String drainWithProgress(Process proc, PluginCall call) throws Exception {
        String lastPath = null;

        try (BufferedReader reader = new BufferedReader(
                new InputStreamReader(proc.getInputStream()))) {
            String line;
            while ((line = reader.readLine()) != null) {
                Log.d(TAG, line);

                // Progress: [download]  72.3% of 5.23MiB at 1.20MiB/s ETA 00:01
                if (line.startsWith("[download]") && line.contains("%")) {
                    try {
                        String pctStr = line.replaceAll(".*?([0-9]+(?:\\.[0-9]+)?)%.*", "$1");
                        int pct = Math.min(100, (int) Double.parseDouble(pctStr));
                        JSObject evt = new JSObject();
                        evt.put("percent", pct);
                        evt.put("line",    line.trim());
                        notifyListeners("downloadProgress", evt);
                    } catch (Exception ignored) {}
                }

                // Capture destination paths from yt-dlp output
                if (line.contains("Destination:")) {
                    lastPath = line.substring(line.indexOf("Destination:") + 12).trim();
                } else if (line.startsWith("[ExtractAudio]") && line.contains("->")) {
                    lastPath = line.substring(line.lastIndexOf("->") + 2).trim().replace("\"", "");
                } else if (line.startsWith("[Merger]") && line.contains("->")) {
                    lastPath = line.substring(line.lastIndexOf("->") + 2).trim().replace("\"", "");
                } else if (line.startsWith("[download] ") && line.endsWith("has already been downloaded")) {
                    lastPath = line.replace("[download] ", "").replace(" has already been downloaded", "").trim();
                }
            }
        }
        return lastPath;
    }

    private String fileToBase64(File file) throws Exception {
        ByteArrayOutputStream bos = new ByteArrayOutputStream((int) file.length());
        try (FileInputStream fis = new FileInputStream(file)) {
            byte[] buf = new byte[65536];
            int n;
            while ((n = fis.read(buf)) != -1) bos.write(buf, 0, n);
        }
        return Base64.encodeToString(bos.toByteArray(), Base64.NO_WRAP);
    }
}
