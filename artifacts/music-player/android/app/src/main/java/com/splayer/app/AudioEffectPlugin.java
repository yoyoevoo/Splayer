package com.splayer.app;

import android.content.Context;
import android.media.AudioManager;
import android.media.audiofx.Equalizer;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;

import androidx.annotation.RequiresApi;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONArray;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

@CapacitorPlugin(name = "AudioEffect")
public class AudioEffectPlugin extends Plugin {

    private static final String TAG = "AudioEffect";

    // One Equalizer per audio session.  Session 0 is always present (global
    // output-mix fallback).  On API 26+ we also attach to every active MUSIC
    // session reported by AudioManager so the EQ reaches the speaker path even
    // when OEM firmware bypasses the session-0 global effect chain.
    private final Map<Integer, Equalizer> eqMap  = new HashMap<>();

    // Master band-level cache (millibels).  Applied immediately to any newly
    // attached session so levels stay consistent across route changes.
    private short[] desiredLevels = null;

    private AudioManager audioManager;
    private AudioManager.AudioPlaybackCallback playbackCb;

    // ── setup ─────────────────────────────────────────────────────────────────

    @PluginMethod
    public void setup(PluginCall call) {
        try {
            releaseAll();   // tear down any previous state cleanly

            audioManager = (AudioManager) getContext()
                .getSystemService(Context.AUDIO_SERVICE);

            // Session 0 — global output-mix fallback (works on Bluetooth and on
            // devices whose speaker path honours the global effect chain).
            attachSession(0);

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                // Enumerate currently-active MUSIC sessions and attach to each.
                // This catches the WebView's session if audio is already playing.
                for (android.media.AudioPlaybackConfiguration cfg :
                        audioManager.getActivePlaybackConfigurations()) {
                    int sid = getSessionId(cfg);
                    if (sid > 0 && isMediaUsage(cfg)) attachSession(sid);
                }

                // Register a callback so future sessions (e.g. the WebView
                // starting playback after this panel was opened) are caught too.
                playbackCb = new AudioManager.AudioPlaybackCallback() {
                    @Override
                    public void onPlaybackConfigChanged(
                            List<android.media.AudioPlaybackConfiguration> configs) {
                        for (android.media.AudioPlaybackConfiguration cfg : configs) {
                            int sid = getSessionId(cfg);
                            if (sid > 0 && isMediaUsage(cfg) && !eqMap.containsKey(sid)) {
                                attachSession(sid);
                            }
                        }
                    }
                };
                audioManager.registerAudioPlaybackCallback(
                    playbackCb, new Handler(Looper.getMainLooper()));
            }

            // Return band info derived from session 0 — counts and ranges are
            // device-wide constants, the same for every session.
            Equalizer ref = eqMap.get(0);
            if (ref == null) { call.reject("EQ setup failed: no session-0 Equalizer"); return; }

            short numBands     = ref.getNumberOfBands();
            short[] levelRange = ref.getBandLevelRange();

            JSArray freqs  = new JSArray();
            JSArray levels = new JSArray();
            for (short i = 0; i < numBands; i++) {
                freqs.put(ref.getCenterFreq(i) / 1000);   // milliHz → Hz
                levels.put(ref.getBandLevel(i));
            }

            JSObject ret = new JSObject();
            ret.put("numBands",   numBands);
            ret.put("minLevel",   levelRange[0]);
            ret.put("maxLevel",   levelRange[1]);
            ret.put("bandFreqs",  freqs);
            ret.put("bandLevels", levels);
            call.resolve(ret);

        } catch (Exception e) {
            Log.e(TAG, "setup failed", e);
            call.reject("EQ setup failed: " + e.getMessage());
        }
    }

    // ── setBandLevel ──────────────────────────────────────────────────────────

    @PluginMethod
    public void setBandLevel(PluginCall call) {
        if (eqMap.isEmpty()) { call.reject("EQ not initialised"); return; }
        try {
            short band  = (short) (int) call.getInt("band",  0);
            short level = (short) (int) call.getInt("level", 0);
            if (desiredLevels != null && band < desiredLevels.length) {
                desiredLevels[band] = level;
            }
            for (Equalizer e : eqMap.values()) e.setBandLevel(band, level);
            call.resolve();
        } catch (Exception e) {
            Log.e(TAG, "setBandLevel", e);
            call.reject(e.getMessage());
        }
    }

    // ── setAllBandLevels ──────────────────────────────────────────────────────

    @PluginMethod
    public void setAllBandLevels(PluginCall call) {
        if (eqMap.isEmpty()) { call.reject("EQ not initialised"); return; }
        try {
            JSONArray arr   = new JSONArray(call.getString("levels", "[]"));
            short     bands = (short) arr.length();
            desiredLevels   = new short[bands];
            for (short i = 0; i < bands; i++) desiredLevels[i] = (short) arr.getInt(i);

            for (Equalizer e : eqMap.values()) {
                for (short i = 0; i < Math.min(e.getNumberOfBands(), bands); i++) {
                    e.setBandLevel(i, desiredLevels[i]);
                }
            }
            call.resolve();
        } catch (Exception e) {
            Log.e(TAG, "setAllBandLevels", e);
            call.reject(e.getMessage());
        }
    }

    // ── release ───────────────────────────────────────────────────────────────

    @PluginMethod
    public void release(PluginCall call) {
        releaseAll();
        call.resolve();
    }

    @Override
    protected void handleOnDestroy() {
        super.handleOnDestroy();
        releaseAll();
    }

    // ── Internal helpers ──────────────────────────────────────────────────────

    /** Creates an Equalizer for {@code sid}, applies current desired levels. */
    private void attachSession(int sid) {
        if (eqMap.containsKey(sid)) return;
        try {
            Equalizer e = new Equalizer(0, sid);
            e.setEnabled(true);
            if (desiredLevels != null) {
                for (short i = 0; i < Math.min(e.getNumberOfBands(), desiredLevels.length); i++) {
                    e.setBandLevel(i, desiredLevels[i]);
                }
            }
            eqMap.put(sid, e);
            Log.d(TAG, "EQ attached to session " + sid);
        } catch (Exception e) {
            // Some sessions reject effects (e.g. system sounds) — skip silently.
            Log.w(TAG, "Cannot attach EQ to session " + sid + ": " + e.getMessage());
        }
    }

    /** Releases all Equalizers and unregisters the playback callback. */
    private void releaseAll() {
        if (playbackCb != null && audioManager != null
                && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            try { audioManager.unregisterAudioPlaybackCallback(playbackCb); }
            catch (Exception ignored) {}
        }
        playbackCb = null;

        for (Equalizer e : eqMap.values()) {
            try { e.release(); } catch (Exception ignored) {}
        }
        eqMap.clear();
    }

    /**
     * Returns the audio session ID from an AudioPlaybackConfiguration.
     * {@code getAudioSessionId()} is public API only from API 33; on 26–32 we
     * use reflection (the method exists but is @hide).
     */
    @RequiresApi(api = Build.VERSION_CODES.O)
    private int getSessionId(android.media.AudioPlaybackConfiguration cfg) {
        // getAudioSessionId() is @hide on all API levels — always use reflection.
        try {
            java.lang.reflect.Method m =
                cfg.getClass().getMethod("getAudioSessionId");
            Object result = m.invoke(cfg);
            return result instanceof Integer ? (Integer) result : 0;
        } catch (Exception ignored) {
            return 0;
        }
    }

    /** Returns true if the configuration is for media (music/video) audio. */
    @RequiresApi(api = Build.VERSION_CODES.O)
    private boolean isMediaUsage(android.media.AudioPlaybackConfiguration cfg) {
        int usage = cfg.getAudioAttributes().getUsage();
        return usage == android.media.AudioAttributes.USAGE_MEDIA
            || usage == android.media.AudioAttributes.USAGE_UNKNOWN;
    }
}
