package com.splayer.app;

import android.media.MediaScannerConnection;
import android.os.Environment;
import android.util.Base64;
import android.util.Log;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONArray;
import org.json.JSONObject;
import org.schabi.newpipe.extractor.Image;
import org.schabi.newpipe.extractor.InfoItem;
import org.schabi.newpipe.extractor.NewPipe;
import org.schabi.newpipe.extractor.ServiceList;
import org.schabi.newpipe.extractor.localization.ContentCountry;
import org.schabi.newpipe.extractor.localization.Localization;
import org.schabi.newpipe.extractor.search.SearchInfo;
import org.schabi.newpipe.extractor.services.youtube.linkHandler.YoutubeSearchQueryHandlerFactory;
import org.schabi.newpipe.extractor.stream.AudioStream;
import org.schabi.newpipe.extractor.stream.StreamInfo;
import org.schabi.newpipe.extractor.stream.StreamInfoItem;
import org.schabi.newpipe.extractor.stream.VideoStream;

import android.media.MediaCodec;
import android.media.MediaExtractor;
import android.media.MediaFormat;
import android.media.MediaMuxer;

import java.nio.ByteBuffer;

import java.util.List;

import java.io.BufferedReader;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;

@CapacitorPlugin(name = "YtDownload")
public class YtDownloadPlugin extends Plugin {

    private static final String TAG = "YtDownloadPlugin";
    // ANDROID_TESTSUITE client (id 30) — bypasses bot detection entirely
    private static final String AT_VER  = "1.9";
    private static final String AT_UA   =
        "com.google.android.youtube/" + AT_VER + " (Linux; U; Android 10) gzip";
    // Legacy aliases used by ytSearch / postJson
    private static final String ANDROID_VER = AT_VER;
    private static final String ANDROID_UA  = AT_UA;

    @Override
    public void load() {
        NewPipe.init(DownloaderImpl.getInstance(),
            new Localization("en", "US"),
            new ContentCountry("US"));
    }

    // ── ytSearch — uses NewPipe Extractor (same library used for downloads) ────

    @PluginMethod
    public void ytSearch(PluginCall call) {
        call.setKeepAlive(true);
        JSObject data = call.getData();
        if (data == null) { call.reject("null data"); return; }
        final String query = call.getString("query", "").trim();
        if (query.isEmpty()) { call.reject("missing query"); return; }

        new Thread(() -> {
            try {
                SearchInfo info = SearchInfo.getInfo(
                    ServiceList.YouTube,
                    ServiceList.YouTube.getSearchQHFactory()
                        .fromQuery(query,
                            Collections.singletonList(YoutubeSearchQueryHandlerFactory.VIDEOS),
                            null));

                JSArray results = new JSArray();
                for (InfoItem item : info.getRelatedItems()) {
                    if (!(item instanceof StreamInfoItem)) continue;
                    StreamInfoItem v = (StreamInfoItem) item;

                    String url     = v.getUrl();
                    String videoId = extractVideoIdFromUrl(url);
                    if (videoId.isEmpty()) continue;

                    String title    = v.getName()         != null ? v.getName()         : "Unknown";
                    String uploader = v.getUploaderName() != null ? v.getUploaderName() : "";
                    long   dur      = v.getDuration();
                    if (dur < 0) dur = 0;
                    int m = (int)(dur / 60), s = (int)(dur % 60);
                    String durStr = dur > 0 ? m + ":" + String.format("%02d", s) : "";

                    // Best thumbnail available; fall back to standard hqdefault
                    String thumb = "https://i.ytimg.com/vi/" + videoId + "/hqdefault.jpg";
                    try {
                        List<Image> thumbs = v.getThumbnails();
                        if (thumbs != null && !thumbs.isEmpty()) {
                            thumb = thumbs.get(thumbs.size() - 1).getUrl();
                        }
                    } catch (Exception ignored) {}

                    JSObject r = new JSObject();
                    r.put("videoId",      videoId);
                    r.put("url",          url);
                    r.put("title",        title);
                    r.put("channelName",  uploader);
                    r.put("durationSecs", dur);
                    r.put("durationText", durStr);
                    r.put("thumbnail",    thumb);
                    results.put(r);
                    if (results.length() >= 10) break;
                }

                Log.d(TAG, "NewPipe search results=" + results.length());
                JSObject ret = new JSObject();
                ret.put("results", results.toString());
                call.resolve(ret);

            } catch (Throwable e) {
                Log.e(TAG, "ytSearch", e);
                call.reject("Search failed: " + (e.getMessage() != null ? e.getMessage() : e.toString()));
            }
        }).start();
    }

    /** Extracts the YouTube video ID from a watch URL (e.g. ?v=dQw4w9WgXcQ). */
    private static String extractVideoIdFromUrl(String url) {
        if (url == null) return "";
        int i = url.indexOf("v=");
        if (i < 0) return "";
        String id = url.substring(i + 2);
        int amp = id.indexOf('&');
        return amp < 0 ? id : id.substring(0, amp);
    }

    // ── ytGetInfo ─────────────────────────────────────────────────────────────

    @PluginMethod
    public void ytGetInfo(PluginCall call) {
        call.setKeepAlive(true);
        JSObject data = call.getData();
        if (data == null) { call.reject("null data"); return; }
        final String videoId = call.getString("videoId", "").trim();
        if (videoId.isEmpty()) { call.reject("missing videoId"); return; }

        new Thread(() -> {
            try {
                JSONObject vd = fetchPlayerData(videoId).getJSONObject("videoDetails");

                String title  = vd.optString("title",  "Unknown");
                String author = vd.optString("author", "Unknown");
                int duration  = 0;
                try { duration = Integer.parseInt(vd.optString("lengthSeconds", "0")); }
                catch (Exception ignored) {}

                String thumb = "";
                try {
                    JSONArray thumbs = vd.getJSONObject("thumbnail").getJSONArray("thumbnails");
                    thumb = thumbs.getJSONObject(thumbs.length() - 1).optString("url", "");
                } catch (Exception ignored) {}

                JSObject info = new JSObject();
                info.put("title",        title);
                info.put("author",       author);
                info.put("durationSecs", duration);
                info.put("thumbnailUrl", thumb);

                JSObject ret = new JSObject();
                ret.put("info", info.toString());
                call.resolve(ret);
            } catch (Throwable e) {
                Log.e(TAG, "ytGetInfo", e);
                call.reject("Failed to get info: " + (e.getMessage() != null ? e.getMessage() : e.toString()));
            }
        }).start();
    }

    // ── ytDownload ────────────────────────────────────────────────────────────
    // format: "mp3" | "audio" → audio only (default)
    //         "mp4" | "video" → video only (no audio)
    //         "merged"        → video + audio merged via FFmpeg

    private boolean isNetworkAvailable() {
        try {
            android.net.ConnectivityManager cm = (android.net.ConnectivityManager)
                getContext().getSystemService(android.content.Context.CONNECTIVITY_SERVICE);
            if (cm == null) return false;
            android.net.NetworkInfo ni = cm.getActiveNetworkInfo();
            return ni != null && ni.isConnected();
        } catch (Exception e) { return true; } // assume connected if check fails
    }

    @PluginMethod
    public void ytDownload(PluginCall call) {
        call.setKeepAlive(true);
        JSObject data = call.getData();
        if (data == null) { call.reject("null data"); return; }
        final String videoId = call.getString("videoId", "").trim();
        if (videoId.isEmpty()) { call.reject("missing videoId"); return; }
        final String format  = call.getString("format",  "mp3");
        final String qualityRaw = call.getString("quality", "720p");
        final java.util.Set<String> VALID_QUALITIES = new java.util.HashSet<>(
            java.util.Arrays.asList("360p", "480p", "720p", "1080p", "360", "480", "720", "1080"));
        final String quality = VALID_QUALITIES.contains(qualityRaw) ? qualityRaw : "720p";

        if (!isNetworkAvailable()) {
            call.reject("No internet connection");
            return;
        }

        new Thread(() -> {
            String videoUrl = "https://www.youtube.com/watch?v=" + videoId;

            // --- NewPipe with 3-attempt exponential backoff ---
            StreamInfo info     = null;
            Throwable lastError = null;
            for (int attempt = 1; attempt <= 3; attempt++) {
                try {
                    Log.d(TAG, "NewPipe attempt " + attempt + ": " + videoUrl + " format=" + format);
                    info = StreamInfo.getInfo(ServiceList.YouTube, videoUrl);
                    lastError = null;
                    break;
                } catch (Throwable e) {
                    lastError = e;
                    Log.w(TAG, "NewPipe attempt " + attempt + " failed: "
                        + (e.getMessage() != null ? e.getMessage() : e.toString()));
                    if (isRateLimitError(e)) {
                        JSObject evt = new JSObject();
                        evt.put("message",
                            "YouTube is rate limiting this device. Trying alternative method...");
                        notifyListeners("ytStatus", evt);
                    }
                    if (attempt < 3) {
                        try { Thread.sleep(2000L * attempt); } catch (InterruptedException ignored) {}
                    }
                }
            }

            if (info != null) {
                try {
                    if ("video".equals(format)) {
                        handleVideoDownload(info, quality, call);
                    } else if ("mp4".equals(format) || "merged".equals(format)) {
                        handleMergedDownload(info, quality, call, videoUrl);
                    } else {
                        handleAudioDownload(info, call);
                    }
                } catch (Throwable e) {
                    Log.e(TAG, "NewPipe download phase failed, trying yt-dlp: " + e.getMessage());
                    tryYtDlpFallback(videoId, format, quality, call, e);
                }
                return;
            }

            // All NewPipe attempts exhausted — fall through to yt-dlp
            tryYtDlpFallback(videoId, format, quality, call, lastError);
        }).start();
    }

    private void handleAudioDownload(StreamInfo info, PluginCall call) throws Exception {
        List<AudioStream> audioStreams = info.getAudioStreams();
        Log.d(TAG, "NewPipe: audioStreams count=" + audioStreams.size());
        if (audioStreams.isEmpty()) { call.reject("No audio streams found"); return; }

        AudioStream best = audioStreams.get(0);
        for (AudioStream s : audioStreams) {
            if (s.getAverageBitrate() > best.getAverageBitrate()) best = s;
        }

        String mimeType = best.getFormat() != null ? best.getFormat().getMimeType() : "audio/mp4";
        String ext      = mimeType.contains("webm") ? "webm" : mimeType.contains("ogg") ? "ogg" : "m4a";
        String title    = info.getName() != null ? info.getName() : "audio";
        String author   = info.getUploaderName() != null ? info.getUploaderName() : "Unknown";

        Log.d(TAG, "NewPipe: audio ext=" + ext + " bitrate=" + best.getAverageBitrate());

        // Stream directly to disk — no byte[] in memory, avoids OOM on large files.
        File tmpAudio = new File(getContext().getCacheDir(), "yt_audio_tmp." + ext);
        downloadStreamToFile(best.getContent(), tmpAudio, call);
        File saved = streamCopyToStorage(tmpAudio, title, ext);
        tmpAudio.delete();

        JSObject ret = new JSObject();
        ret.put("base64",    "");
        ret.put("filePath",  saved.getAbsolutePath());
        ret.put("fileSize",  saved.length());
        ret.put("ext",       ext);
        ret.put("mimeType",  mimeType);
        ret.put("title",     title);
        ret.put("author",    author);
        call.resolve(ret);
    }

    private void handleVideoDownload(StreamInfo info, String quality, PluginCall call) throws Exception {
        List<VideoStream> videoStreams = info.getVideoOnlyStreams();
        if (videoStreams.isEmpty()) videoStreams = info.getVideoStreams();
        if (videoStreams.isEmpty()) { call.reject("No video streams found"); return; }

        VideoStream best = pickVideoStream(videoStreams, quality);
        String mimeType  = best.getFormat() != null ? best.getFormat().getMimeType() : "video/mp4";
        String ext       = mimeType.contains("webm") ? "webm" : "mp4";
        String title     = info.getName() != null ? info.getName() : "video";
        String author    = info.getUploaderName() != null ? info.getUploaderName() : "Unknown";

        Log.d(TAG, "NewPipe: video-only ext=" + ext + " res=" + best.getResolution());
        byte[] bytes = downloadStream(best.getContent(), call);
        persistToStorage(title, ext, bytes);

        JSObject ret = new JSObject();
        ret.put("base64",   Base64.encodeToString(bytes, Base64.NO_WRAP));
        ret.put("ext",      ext);
        ret.put("mimeType", mimeType);
        ret.put("title",    title);
        ret.put("author",   author);
        call.resolve(ret);
    }

    private void handleMergedDownload(StreamInfo info, String quality, PluginCall call, String videoUrl) throws Exception {
        String title  = info.getName() != null ? info.getName() : "video";
        String author = info.getUploaderName() != null ? info.getUploaderName() : "Unknown";

        // Prefer H.264 video-only stream — MediaMuxer handles H.264+AAC→MP4 natively
        List<VideoStream> videoOnlyStreams = info.getVideoOnlyStreams();
        List<AudioStream> audioStreams = info.getAudioStreams();

        // Prefer AAC/M4A audio — Opus cannot be muxed into MP4 by MediaMuxer
        AudioStream bestAudio = null;
        for (AudioStream s : audioStreams) {
            String mime = s.getFormat() != null ? s.getFormat().getMimeType() : "";
            if (mime.contains("mp4") || mime.contains("aac")) {
                if (bestAudio == null || s.getAverageBitrate() > bestAudio.getAverageBitrate())
                    bestAudio = s;
            }
        }
        if (bestAudio == null && !audioStreams.isEmpty()) {
            // No AAC found — fall back to highest-bitrate stream; mux may fail
            bestAudio = audioStreams.get(0);
            for (AudioStream s : audioStreams) {
                if (s.getAverageBitrate() > bestAudio.getAverageBitrate()) bestAudio = s;
            }
            Log.w(TAG, "No AAC audio stream found — falling back to " +
                (bestAudio.getFormat() != null ? bestAudio.getFormat().getMimeType() : "unknown"));
        }

        if (BuildConfig.DEBUG) {
            Log.d(TAG, "NewPipe: videoOnlyStreams count=" + videoOnlyStreams.size());
            for (VideoStream s : videoOnlyStreams) {
                String mime = s.getFormat() != null ? s.getFormat().getMimeType() : "null";
                Log.d(TAG, "  stream res=" + s.getResolution() + " mime=" + mime + " content=" + s.getContent().substring(0, Math.min(80, s.getContent().length())));
            }
            Log.d(TAG, "NewPipe: audioStreams count=" + audioStreams.size());
            for (AudioStream s : audioStreams) {
                String mime = s.getFormat() != null ? s.getFormat().getMimeType() : "null";
                Log.d(TAG, "  audio mime=" + mime + " bitrate=" + s.getAverageBitrate());
            }
        }

        VideoStream h264Stream = null;
        for (VideoStream s : videoOnlyStreams) {
            String mime = s.getFormat() != null ? s.getFormat().getMimeType() : "";
            if (mime.contains("avc") || mime.equals("video/mp4")) {
                if (s.getResolution() != null && s.getResolution().contains(quality)) {
                    h264Stream = s; break;
                }
                if (h264Stream == null) h264Stream = s;
            }
        }
        Log.d(TAG, "NewPipe: h264Stream=" + (h264Stream != null ? h264Stream.getResolution() + " " + (h264Stream.getFormat() != null ? h264Stream.getFormat().getMimeType() : "?") : "null"));
        Log.d(TAG, "NewPipe: bestAudio=" + (bestAudio != null ? (bestAudio.getFormat() != null ? bestAudio.getFormat().getMimeType() : "?") + " " + bestAudio.getAverageBitrate() + "kbps" : "null"));

        if (h264Stream != null && bestAudio != null) {
            android.content.Context ctx = getContext();
            File cache    = ctx.getCacheDir();
            String audioMime = bestAudio.getFormat() != null ? bestAudio.getFormat().getMimeType() : "audio/mp4";
            String audioExt  = audioMime.contains("webm") ? "webm" : audioMime.contains("ogg") ? "ogg" : "m4a";
            File videoTmp  = new File(cache, "yt_v_tmp.mp4");
            File audioTmp  = new File(cache, "yt_a_tmp." + audioExt);
            File outputTmp = new File(cache, "yt_merged_tmp.mp4");
            Log.d(TAG, "Mux: audioExt=" + audioExt + " audioMime=" + audioMime);

            // Re-fetch stream info immediately before downloading so CDN URLs are fresh.
            Log.d(TAG, "NewPipe: re-fetching fresh CDN URLs for " + videoUrl);
            StreamInfo freshInfo = StreamInfo.getInfo(ServiceList.YouTube, videoUrl);

            // Pick matching streams from the fresh info by resolution / bitrate.
            VideoStream freshVideo = null;
            for (VideoStream s : freshInfo.getVideoOnlyStreams()) {
                String mime = s.getFormat() != null ? s.getFormat().getMimeType() : "";
                if (mime.contains("avc") || mime.equals("video/mp4")) {
                    if (s.getResolution() != null && h264Stream.getResolution() != null
                            && s.getResolution().equals(h264Stream.getResolution())) {
                        freshVideo = s; break;
                    }
                    if (freshVideo == null) freshVideo = s;
                }
            }
            AudioStream freshAudio = null;
            for (AudioStream s : freshInfo.getAudioStreams()) {
                String mime = s.getFormat() != null ? s.getFormat().getMimeType() : "";
                if (mime.contains("mp4") || mime.contains("aac")) {
                    if (freshAudio == null || s.getAverageBitrate() > freshAudio.getAverageBitrate())
                        freshAudio = s;
                }
            }
            if (freshAudio == null && !freshInfo.getAudioStreams().isEmpty())
                freshAudio = freshInfo.getAudioStreams().get(0);

            String freshVideoUrl = (freshVideo != null) ? freshVideo.getContent() : h264Stream.getContent();
            String freshAudioUrl = (freshAudio != null) ? freshAudio.getContent() : bestAudio.getContent();

            Log.d(TAG, "NewPipe: merged via MediaMuxer res=" + h264Stream.getResolution());
            downloadStreamToFile(freshVideoUrl, videoTmp, call);
            downloadStreamToFile(freshAudioUrl, audioTmp, null);

            Log.d(TAG, "Mux: videoTmp size=" + videoTmp.length() + " audioTmp size=" + audioTmp.length());
            if (videoTmp.length() == 0) throw new Exception("Video download empty: " + videoTmp.getName());
            if (audioTmp.length() == 0) throw new Exception("Audio download empty: " + audioTmp.getName());

            mergeVideoAudio(videoTmp, audioTmp, outputTmp);

            // Stream-copy merged file to persistent storage — never load into memory.
            File saved = streamCopyToStorage(outputTmp, title, "mp4");
            videoTmp.delete(); audioTmp.delete(); outputTmp.delete();

            JSObject ret = new JSObject();
            ret.put("base64",    "");
            ret.put("filePath",  saved.getAbsolutePath());
            ret.put("fileSize",  saved.length());
            ret.put("ext",       "mp4");
            ret.put("mimeType",  "video/mp4");
            ret.put("title",     title);
            ret.put("author",    author);
            call.resolve(ret);
            return;
        }

        // Fallback: muxed stream (video+audio already combined, typically ≤720p)
        List<VideoStream> muxedStreams = info.getVideoStreams();
        if (!muxedStreams.isEmpty()) {
            VideoStream best = pickVideoStream(muxedStreams, quality);
            String mimeType  = best.getFormat() != null ? best.getFormat().getMimeType() : "video/mp4";
            String ext       = mimeType.contains("webm") ? "webm" : "mp4";
            Log.d(TAG, "NewPipe: merged fallback to muxed stream res=" + best.getResolution());

            // Re-fetch fresh CDN URL before downloading.
            String muxUrl = best.getContent();
            try {
                StreamInfo freshMux = StreamInfo.getInfo(ServiceList.YouTube, videoUrl);
                VideoStream freshBest = pickVideoStream(freshMux.getVideoStreams(), quality);
                if (freshBest != null) muxUrl = freshBest.getContent();
            } catch (Exception ex) {
                Log.w(TAG, "Mux fallback re-fetch failed, using original URL: " + ex.getMessage());
            }

            // Download directly to a temp file, then stream-copy to storage.
            File muxTmp = new File(getContext().getCacheDir(), "yt_mux_tmp." + ext);
            downloadStreamToFile(muxUrl, muxTmp, call);
            File saved = streamCopyToStorage(muxTmp, title, ext);
            muxTmp.delete();

            JSObject ret = new JSObject();
            ret.put("base64",    "");
            ret.put("filePath",  saved.getAbsolutePath());
            ret.put("fileSize",  saved.length());
            ret.put("ext",       ext);
            ret.put("mimeType",  "video/" + ext);
            ret.put("title",     title);
            ret.put("author",    author);
            call.resolve(ret);
            return;
        }

        call.reject("No suitable video streams found for merged download");
    }

    private void mergeVideoAudio(File videoFile, File audioFile, File outputFile) throws Exception {
        MediaExtractor videoExt = new MediaExtractor();
        MediaExtractor audioExt = new MediaExtractor();
        MediaMuxer muxer = null;
        try {
            videoExt.setDataSource(videoFile.getAbsolutePath());
            audioExt.setDataSource(audioFile.getAbsolutePath());

            // Log all tracks in both files
            Log.d(TAG, "Mux: video file tracks=" + videoExt.getTrackCount());
            for (int i = 0; i < videoExt.getTrackCount(); i++)
                Log.d(TAG, "  video[" + i + "] fmt=" + videoExt.getTrackFormat(i));
            Log.d(TAG, "Mux: audio file tracks=" + audioExt.getTrackCount());
            for (int i = 0; i < audioExt.getTrackCount(); i++)
                Log.d(TAG, "  audio[" + i + "] fmt=" + audioExt.getTrackFormat(i));

            int videoTrack = -1; MediaFormat videoFmt = null;
            for (int i = 0; i < videoExt.getTrackCount(); i++) {
                MediaFormat f = videoExt.getTrackFormat(i);
                String m = f.getString(MediaFormat.KEY_MIME);
                if (m != null && m.startsWith("video/")) { videoTrack = i; videoFmt = f; break; }
            }
            int audioTrack = -1; MediaFormat audioFmt = null;
            for (int i = 0; i < audioExt.getTrackCount(); i++) {
                MediaFormat f = audioExt.getTrackFormat(i);
                String m = f.getString(MediaFormat.KEY_MIME);
                if (m != null && m.startsWith("audio/")) { audioTrack = i; audioFmt = f; break; }
            }
            if (videoTrack < 0) throw new Exception("No video track in video file");
            if (audioTrack < 0) throw new Exception("No audio track in audio file");

            Log.d(TAG, "Mux: selected videoFmt=" + videoFmt);
            Log.d(TAG, "Mux: selected audioFmt=" + audioFmt);

            muxer = new MediaMuxer(outputFile.getAbsolutePath(), MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4);
            videoExt.selectTrack(videoTrack);
            audioExt.selectTrack(audioTrack);

            int muxV, muxA;
            try {
                muxV = muxer.addTrack(videoFmt);
                Log.d(TAG, "Mux: addTrack(video) → track " + muxV);
            } catch (Exception e) {
                throw new Exception("addTrack(video) failed — mime=" + videoFmt.getString(MediaFormat.KEY_MIME) + ": " + e.getMessage());
            }
            try {
                muxA = muxer.addTrack(audioFmt);
                Log.d(TAG, "Mux: addTrack(audio) → track " + muxA);
            } catch (Exception e) {
                throw new Exception("addTrack(audio) failed — mime=" + audioFmt.getString(MediaFormat.KEY_MIME) + ": " + e.getMessage());
            }
            muxer.start();

            ByteBuffer buf = ByteBuffer.allocate(2 * 1024 * 1024);
            MediaCodec.BufferInfo bi = new MediaCodec.BufferInfo();

            videoExt.seekTo(0, MediaExtractor.SEEK_TO_CLOSEST_SYNC);
            while (true) {
                int sz = videoExt.readSampleData(buf, 0);
                if (sz < 0) break;
                bi.offset = 0; bi.size = sz;
                bi.presentationTimeUs = videoExt.getSampleTime();
                bi.flags = videoExt.getSampleFlags();
                muxer.writeSampleData(muxV, buf, bi);
                videoExt.advance();
            }

            audioExt.seekTo(0, MediaExtractor.SEEK_TO_CLOSEST_SYNC);
            while (true) {
                int sz = audioExt.readSampleData(buf, 0);
                if (sz < 0) break;
                bi.offset = 0; bi.size = sz;
                bi.presentationTimeUs = audioExt.getSampleTime();
                bi.flags = audioExt.getSampleFlags();
                muxer.writeSampleData(muxA, buf, bi);
                audioExt.advance();
            }

            muxer.stop();
        } finally {
            videoExt.release();
            audioExt.release();
            if (muxer != null) try { muxer.release(); } catch (Exception ignored) {}
        }
    }

    private VideoStream pickVideoStream(List<VideoStream> streams, String quality) {
        for (VideoStream s : streams) {
            if (s.getResolution() != null && s.getResolution().contains(quality)) return s;
        }
        return streams.get(0);
    }

    // ── Innertube helpers (used by ytGetInfo / ytSearch) ─────────────────────

    private JSONObject fetchPlayerData(String videoId) throws Exception {
        JSONObject client = new JSONObject()
            .put("clientName",      "ANDROID_TESTSUITE")
            .put("clientVersion",   AT_VER)
            .put("androidSdkVersion", 30)
            .put("hl",              "en")
            .put("gl",              "US");

        JSONObject thirdParty = new JSONObject()
            .put("embedUrl", "https://www.youtube.com/");

        String body = new JSONObject()
            .put("context",        new JSONObject()
                .put("client",     client)
                .put("thirdParty", thirdParty))
            .put("videoId",        videoId)
            .put("contentCheckOk", true)
            .put("racyCheckOk",    true)
            .toString();

        URL url = new URL("https://www.youtube.com/youtubei/v1/player?prettyPrint=false");
        HttpURLConnection conn = (HttpURLConnection) url.openConnection();
        conn.setRequestMethod("POST");
        conn.setRequestProperty("Content-Type",             "application/json");
        conn.setRequestProperty("User-Agent",               AT_UA);
        conn.setRequestProperty("X-YouTube-Client-Name",   "30");
        conn.setRequestProperty("X-YouTube-Client-Version", AT_VER);
        conn.setConnectTimeout(20_000);
        conn.setReadTimeout(20_000);
        conn.setDoOutput(true);

        try (OutputStream os = conn.getOutputStream()) {
            os.write(body.getBytes(StandardCharsets.UTF_8));
        }

        int code = conn.getResponseCode();
        InputStream is = code >= 400 ? conn.getErrorStream() : conn.getInputStream();
        if (is == null) throw new Exception("HTTP " + code + " (empty body)");

        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        byte[] buf = new byte[8192]; int n;
        while ((n = is.read(buf)) != -1) baos.write(buf, 0, n);
        is.close();

        String resp = baos.toString("UTF-8");
        if (code >= 400)
            throw new Exception("HTTP " + code + ": " + resp.substring(0, Math.min(300, resp.length())));
        return new JSONObject(resp);
    }

    // ── Download + storage ────────────────────────────────────────────────────

    private byte[] downloadStream(String streamUrl, PluginCall call) throws Exception {
        Exception lastEx = null;
        for (int attempt = 1; attempt <= 3; attempt++) {
            try {
                return doDownloadStream(streamUrl, call);
            } catch (java.io.IOException e) {
                lastEx = e;
                Log.w(TAG, "downloadStream attempt " + attempt + " failed: " + e.getMessage());
                if (attempt < 3) Thread.sleep(1500L * attempt);
            }
        }
        throw lastEx;
    }

    private byte[] doDownloadStream(String streamUrl, PluginCall call) throws Exception {
        long offset  = 0;
        long total   = -1;
        int  lastPct = -1;
        ByteArrayOutputStream bos = new ByteArrayOutputStream();

        // YouTube CDN may close the connection early (throttling).
        // Re-open with a resumed Range header until the full file is received.
        for (int seg = 0; seg < 30; seg++) {
            URL url = new URL(streamUrl);
            HttpURLConnection conn = (HttpURLConnection) url.openConnection();
            conn.setRequestProperty("User-Agent", ANDROID_UA);
            conn.setRequestProperty("Range", "bytes=" + offset + "-");
            conn.setRequestProperty("Accept-Encoding", "identity");
            conn.setConnectTimeout(30_000);
            conn.setReadTimeout(300_000);
            conn.connect();

            int code = conn.getResponseCode();
            if (code != 200 && code != 206) {
                throw new java.io.IOException("HTTP " + code + " for stream");
            }

            if (total <= 0) {
                total = conn.getContentLengthLong();
                if (total <= 0) {
                    String cr = conn.getHeaderField("Content-Range");
                    if (cr != null) {
                        try { total = Long.parseLong(cr.substring(cr.lastIndexOf('/') + 1)); }
                        catch (Exception ignored) {}
                    }
                }
            }

            try (InputStream in = conn.getInputStream()) {
                byte[] buf = new byte[32_768]; int n;
                while ((n = in.read(buf)) != -1) {
                    bos.write(buf, 0, n);
                    offset += n;
                    if (total > 0) {
                        int pct = (int)(offset * 100L / total);
                        if (pct != lastPct) {
                            lastPct = pct;
                            JSObject evt = new JSObject();
                            evt.put("percent", pct);
                            notifyListeners("ytProgress", evt);
                        }
                    }
                }
            }

            if (total <= 0 || offset >= total) break;
            Log.w(TAG, "Audio stream closed early at " + offset + "/" + total + " bytes — resuming");
            Thread.sleep(500);
        }

        if (total > 0 && offset < total) {
            throw new java.io.IOException("Incomplete download: got " + offset + " of " + total + " bytes");
        }
        if (bos.size() == 0) {
            throw new java.io.IOException("Download produced 0 bytes");
        }
        return bos.toByteArray();
    }

    private void downloadStreamToFile(String streamUrl, File dest, PluginCall call) throws Exception {
        Exception lastEx = null;
        for (int attempt = 1; attempt <= 3; attempt++) {
            try {
                doDownloadToFile(streamUrl, dest, call);
                return;
            } catch (java.io.IOException e) {
                lastEx = e;
                Log.w(TAG, "downloadStreamToFile attempt " + attempt + " failed: " + e.getMessage());
                if (attempt < 3) Thread.sleep(1500L * attempt);
            }
        }
        throw lastEx;
    }

    private void doDownloadToFile(String streamUrl, File dest, PluginCall call) throws Exception {
        // Start fresh — delete any partial file from a previous attempt.
        if (dest.exists()) dest.delete();

        long offset  = 0;
        long total   = -1;
        int  lastPct = -1;

        // YouTube CDN may close the connection before all bytes are delivered.
        // Resume with Range: bytes=<offset>- until the full file is received.
        for (int seg = 0; seg < 30; seg++) {
            URL url = new URL(streamUrl);
            HttpURLConnection conn = (HttpURLConnection) url.openConnection();
            conn.setRequestProperty("User-Agent", ANDROID_UA);
            conn.setRequestProperty("Range", "bytes=" + offset + "-");
            conn.setRequestProperty("Accept-Encoding", "identity");
            conn.setConnectTimeout(30_000);
            conn.setReadTimeout(300_000);
            conn.connect();

            int code = conn.getResponseCode();
            if (code != 200 && code != 206) {
                throw new java.io.IOException("HTTP " + code + " for stream: " + streamUrl.substring(0, Math.min(80, streamUrl.length())));
            }

            if (total <= 0) {
                total = conn.getContentLengthLong();
                if (total <= 0) {
                    String cr = conn.getHeaderField("Content-Range");
                    if (cr != null) {
                        try { total = Long.parseLong(cr.substring(cr.lastIndexOf('/') + 1)); }
                        catch (Exception ignored) {}
                    }
                }
            }

            // Append to file for resumed segments; overwrite for the first segment.
            try (InputStream in   = conn.getInputStream();
                 FileOutputStream fos = new FileOutputStream(dest, offset > 0)) {
                byte[] buf = new byte[32_768]; int n;
                while ((n = in.read(buf)) != -1) {
                    fos.write(buf, 0, n);
                    offset += n;
                    if (call != null && total > 0) {
                        int pct = (int)(offset * 100L / total);
                        if (pct != lastPct) {
                            lastPct = pct;
                            JSObject evt = new JSObject();
                            evt.put("percent", pct);
                            notifyListeners("ytProgress", evt);
                        }
                    }
                }
            }

            if (total <= 0 || offset >= total) break;
            Log.w(TAG, "File stream closed early at " + offset + "/" + total + " bytes — resuming");
            Thread.sleep(500);
        }

        if (total > 0 && offset < total) {
            throw new java.io.IOException("Incomplete file download: got " + offset + " of " + total + " bytes");
        }
        if (!dest.exists() || dest.length() == 0) {
            throw new java.io.IOException("Download produced empty file: " + dest.getName());
        }
    }

    private byte[] readFileBytes(File f) throws Exception {
        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        try (InputStream fis = new java.io.FileInputStream(f)) {
            byte[] buf = new byte[32_768]; int n;
            while ((n = fis.read(buf)) != -1) baos.write(buf, 0, n);
        }
        return baos.toByteArray();
    }

    /** Stream-copy {@code src} to Splayer Downloads using an 8 KB buffer — no byte[] in memory. */
    private File streamCopyToStorage(File src, String title, String ext) throws Exception {
        android.content.Context ctx = getContext();
        File extDir = ctx.getExternalFilesDir(android.os.Environment.DIRECTORY_MUSIC);
        File dir = new File(extDir != null ? extDir : ctx.getFilesDir(), "Splayer Downloads");
        if (!dir.exists()) dir.mkdirs();

        String safe = title.replaceAll("[<>:\"/\\\\|?*\\x00-\\x1f]", "_");
        if (safe.length() > 120) safe = safe.substring(0, 120);
        File dest = new File(dir, safe + "." + ext);
        if (!dest.getCanonicalPath().startsWith(dir.getCanonicalPath() + File.separator)) {
            throw new Exception("Path traversal detected: " + dest.getPath());
        }

        try (java.io.InputStream in  = new java.io.FileInputStream(src);
             FileOutputStream    out = new FileOutputStream(dest)) {
            byte[] buf = new byte[8192];
            int n;
            while ((n = in.read(buf)) != -1) out.write(buf, 0, n);
        }

        if (!dest.exists() || dest.length() == 0) {
            throw new Exception("Merged output is missing or empty: " + dest.getAbsolutePath());
        }

        MediaScannerConnection.scanFile(ctx, new String[]{ dest.getAbsolutePath() }, null, null);
        return dest;
    }

    private void persistToStorage(String title, String ext, byte[] bytes) {
        try {
            android.content.Context ctx = getContext();
            if (ctx == null) return;
            File extDir = ctx.getExternalFilesDir(Environment.DIRECTORY_MUSIC);
            File dir = new File(extDir != null ? extDir : ctx.getFilesDir(), "Splayer Downloads");
            if (!dir.exists()) dir.mkdirs();

            String safe = title.replaceAll("[<>:\"/\\\\|?*\\x00-\\x1f]", "_");
            if (safe.length() > 120) safe = safe.substring(0, 120);

            File out = new File(dir, safe + "." + ext);
            if (!out.getCanonicalPath().startsWith(dir.getCanonicalPath() + File.separator)) {
                Log.w(TAG, "persistToStorage: path traversal blocked for: " + out.getPath());
                return;
            }
            try (FileOutputStream fos = new FileOutputStream(out)) { fos.write(bytes); }

            if (ctx != null) {
                MediaScannerConnection.scanFile(ctx, new String[]{ out.getAbsolutePath() }, null, null);
            }
        } catch (Exception e) {
            Log.w(TAG, "persistToStorage (non-fatal): " + e.getMessage());
        }
    }

    // ── HTTP helpers ──────────────────────────────────────────────────────────

    private String postJson(String endpoint, String body, boolean isAndroidClient) throws Exception {
        URL url = new URL(endpoint);
        HttpURLConnection conn = (HttpURLConnection) url.openConnection();
        conn.setRequestMethod("POST");
        conn.setRequestProperty("Content-Type", "application/json; charset=UTF-8");
        conn.setRequestProperty("Accept", "application/json");
        conn.setConnectTimeout(20_000);
        conn.setReadTimeout(20_000);
        conn.setDoOutput(true);

        if (isAndroidClient) {
            conn.setRequestProperty("User-Agent",               AT_UA);
            conn.setRequestProperty("X-YouTube-Client-Name",   "30");
            conn.setRequestProperty("X-YouTube-Client-Version", AT_VER);
        } else {
            conn.setRequestProperty("User-Agent",
                "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36");
            conn.setRequestProperty("X-YouTube-Client-Name", "1");
            conn.setRequestProperty("X-YouTube-Client-Version", "2.20231121.08.00");
        }

        try (OutputStream os = conn.getOutputStream()) {
            os.write(body.getBytes(StandardCharsets.UTF_8));
        }

        int code = conn.getResponseCode();
        InputStream is = code >= 400 ? conn.getErrorStream() : conn.getInputStream();
        if (is == null) throw new Exception("HTTP " + code + " (empty body)");

        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        byte[] buf = new byte[8192]; int n;
        while ((n = is.read(buf)) != -1) baos.write(buf, 0, n);
        is.close();

        String resp = baos.toString("UTF-8");
        if (code >= 400)
            throw new Exception("HTTP " + code + ": " + resp.substring(0, Math.min(200, resp.length())));
        return resp;
    }

    // ── yt-dlp fallback ───────────────────────────────────────────────────────

    private boolean isRateLimitError(Throwable e) {
        if (e == null) return false;
        String msg = (e.getMessage() != null ? e.getMessage() : "") + " " + e.getClass().getName();
        return msg.contains("403") || msg.contains("429")
            || msg.contains("ReCaptcha") || msg.contains("rate limit");
    }

    private void tryYtDlpFallback(String videoId, String format, String quality,
                                   PluginCall call, Throwable newPipeError) {
        String errorMsg = newPipeError != null
            ? (newPipeError.getMessage() != null ? newPipeError.getMessage() : newPipeError.toString())
            : "unknown";
        Log.w(TAG, "NewPipe exhausted — falling through to yt-dlp fallback. Reason: " + errorMsg);

        try {
            File bin = ensureYtDlpBinary();
            String url = "https://www.youtube.com/watch?v=" + videoId;

            List<String> cmd = new ArrayList<>();
            cmd.add(bin.getAbsolutePath());

            File deno = ensureDenoIfAvailable();
            if (deno != null) {
                cmd.add("--extractor-args");
                cmd.add("youtube:player_client=android");
                cmd.add("--js-runtimes");
                cmd.add("deno:" + deno.getAbsolutePath());
            }

            boolean isVideo = "video".equals(format) || "mp4".equals(format) || "merged".equals(format);
            if (isVideo) {
                String qNum = quality.replace("p", "");
                cmd.add("-f");
                cmd.add("bestvideo[height<=" + qNum + "]+bestaudio/best[height<=" + qNum + "]");
                cmd.add("--merge-output-format"); cmd.add("mp4");
            } else {
                cmd.add("-x");
                cmd.add("--audio-format"); cmd.add("mp3");
                cmd.add("--audio-quality"); cmd.add("0");
            }

            android.content.Context ctx = getContext();
            File extDir = ctx.getExternalFilesDir(android.os.Environment.DIRECTORY_MUSIC);
            File outDir = new File(extDir != null ? extDir : ctx.getFilesDir(), "Splayer Downloads");
            if (!outDir.exists()) outDir.mkdirs();

            cmd.add("-o"); cmd.add(outDir.getAbsolutePath() + "/%(title)s.%(ext)s");
            cmd.add("--no-playlist");
            cmd.add("--newline");
            cmd.add("--no-colors");
            cmd.add(url);

            Log.d(TAG, "yt-dlp fallback cmd: " + cmd);

            ProcessBuilder pb = new ProcessBuilder(cmd);
            pb.environment().put("HOME", ctx.getFilesDir().getAbsolutePath());
            pb.environment().put("TMPDIR", ctx.getCacheDir().getAbsolutePath());
            pb.redirectErrorStream(true);
            Process proc = pb.start();

            String outPath = drainYtDlpOutput(proc, call);
            int exit = proc.waitFor();

            if (exit != 0 || outPath == null) {
                throw new Exception("yt-dlp exited " + exit + ", no output path detected");
            }

            File outFile = new File(outPath);
            MediaScannerConnection.scanFile(ctx, new String[]{ outFile.getAbsolutePath() }, null, null);

            String fileName = outFile.getName();
            int dotIdx = fileName.lastIndexOf('.');
            String ext = dotIdx >= 0 ? fileName.substring(dotIdx + 1) : (isVideo ? "mp4" : "mp3");
            String mime = ext.equals("mp4") ? "video/mp4" : "audio/mpeg";

            JSObject ret = new JSObject();
            ret.put("base64",   "");
            ret.put("filePath", outFile.getAbsolutePath());
            ret.put("fileSize", outFile.length());
            ret.put("ext",      ext);
            ret.put("mimeType", mime);
            ret.put("title",    fileName.substring(0, dotIdx > 0 ? dotIdx : fileName.length()));
            ret.put("author",   "Unknown");
            call.resolve(ret);

        } catch (Exception e) {
            Log.e(TAG, "yt-dlp fallback failed: " + e.getMessage());
            String userMsg;
            if (!isNetworkAvailable()) {
                userMsg = "No internet connection";
            } else if (newPipeError != null && isRateLimitError(newPipeError)) {
                userMsg = "Download failed. YouTube may be blocking this device. Try again in a few minutes.";
            } else {
                userMsg = "Download failed. YouTube may be blocking this device. Try again in a few minutes.";
            }
            call.reject(userMsg);
        }
    }

    private File ensureYtDlpBinary() throws Exception {
        File dest = new File(getContext().getFilesDir(), "ytdlp");
        if (!dest.exists() || dest.length() == 0) {
            String srcPath = getContext().getApplicationInfo().nativeLibraryDir + "/libytdlp.so";
            File src = new File(srcPath);
            if (!src.exists()) {
                Log.e(TAG, "yt-dlp binary not found — fallback unavailable. Expected: " + srcPath);
                throw new Exception("yt-dlp binary not found — fallback unavailable");
            }
            Log.d(TAG, "Copying yt-dlp from " + srcPath);
            try (FileInputStream in  = new FileInputStream(src);
                 FileOutputStream out = new FileOutputStream(dest)) {
                byte[] buf = new byte[65536]; int n;
                while ((n = in.read(buf)) != -1) out.write(buf, 0, n);
            }
        }
        dest.setExecutable(true, true);
        return dest;
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
            dest.setExecutable(true, true);
            Log.d(TAG, "Deno runtime available at: " + dest.getAbsolutePath());
            return dest;
        } catch (Exception e) {
            Log.w(TAG, "Deno not available: " + e.getMessage());
            return null;
        }
    }

    /** Read yt-dlp stdout, fire ytProgress events, return last detected output path. */
    private String drainYtDlpOutput(Process proc, PluginCall call) throws Exception {
        String lastPath = null;
        try (BufferedReader reader = new BufferedReader(
                new InputStreamReader(proc.getInputStream()))) {
            String line;
            while ((line = reader.readLine()) != null) {
                Log.d(TAG, "yt-dlp: " + line);
                if (line.startsWith("[download]") && line.contains("%")) {
                    try {
                        String pctStr = line.replaceAll(".*?([0-9]+(?:\\.[0-9]+)?)%.*", "$1");
                        int pct = Math.min(100, (int) Double.parseDouble(pctStr));
                        JSObject evt = new JSObject();
                        evt.put("percent", pct);
                        notifyListeners("ytProgress", evt);
                    } catch (Exception ignored) {}
                }
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

}
