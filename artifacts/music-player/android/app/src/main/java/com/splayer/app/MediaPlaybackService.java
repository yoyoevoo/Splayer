package com.splayer.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.graphics.Bitmap;
import android.media.AudioManager;
import android.graphics.BitmapFactory;
import android.os.Build;
import android.os.IBinder;
import android.os.SystemClock;
import android.support.v4.media.MediaMetadataCompat;
import android.support.v4.media.session.MediaSessionCompat;
import android.support.v4.media.session.PlaybackStateCompat;
import android.util.Log;

import androidx.core.app.NotificationCompat;
import androidx.media.app.NotificationCompat.MediaStyle;

public class MediaPlaybackService extends Service {

    private static final String TAG = "SplayerMedia";

    static final String CHANNEL_ID    = "splayer_playback";
    static final int    NOTIF_ID      = 1337;
    static final String ACTION_UPDATE = "com.splayer.app.ACTION_UPDATE";
    static final String ACTION_STOP   = "com.splayer.app.ACTION_STOP";
    static final String ACTION_REPOST = "com.splayer.app.ACTION_REPOST";

    // Album art handoff (avoids binder size limits)
    static volatile Bitmap  pendingArtwork = null;
    static volatile boolean artworkUpdated = false;

    private NotificationManager nm;
    private MediaSessionCompat  session;
    private Bitmap placeholder;

    private String  title   = "";
    private String  artist  = "";
    private String  album   = "";
    private boolean playing = false;
    private long    posMs   = 0;
    private long    durMs   = 0;
    private Bitmap  artwork = null;

    private NoisyAudioReceiver noisyReceiver;
    private boolean            noisyReceiverRegistered = false;
    // Audio focus is intentionally NOT managed here: Chromium's AudioFocusDelegate
    // holds focus on behalf of the WebView. Requesting focus in the Service too
    // causes a self-inflicted AUDIOFOCUS_LOSS that immediately pauses playback.

    // ── Lifecycle ─────────────────────────────────────────────────────────────

    @Override
    public void onCreate() {
        super.onCreate();
        Log.d(TAG, "=== MediaPlaybackService.onCreate START ===");

        nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);

        Log.d(TAG, "  createChannel...");
        createChannel();

        Log.d(TAG, "  loadPlaceholder...");
        loadPlaceholder();

        Log.d(TAG, "  initSession...");
        initSession();

        noisyReceiver = new NoisyAudioReceiver();
        Log.d(TAG, "  NoisyAudioReceiver initialized");

        // ── Post a placeholder notification immediately ────────────────────────
        // Android 8+ (startForegroundService) requires startForeground() to be
        // called within 5 seconds of the service being created, or the system
        // raises a ForegroundServiceStartNotAllowedException and kills the service.
        // Posting here (before any ACTION_UPDATE arrives) avoids that window.
        // The notification is updated with real track data when ACTION_UPDATE fires.
        Notification placeholder_notif = buildNotification();
        Log.d(TAG, "  calling startForeground with placeholder notification...");
        startForeground(NOTIF_ID, placeholder_notif);
        Log.d(TAG, "=== MediaPlaybackService.onCreate DONE — foreground started ===");
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null) {
            Log.w(TAG, "onStartCommand: null intent (service restarted by OS)");
            return START_STICKY;
        }

        final String action = intent.getAction();
        Log.d(TAG, "onStartCommand: action=" + action);

        if (ACTION_STOP.equals(action)) {
            Log.d(TAG, "  → stopping foreground service");
            if (noisyReceiverRegistered) {
                unregisterReceiver(noisyReceiver);
                noisyReceiverRegistered = false;
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                stopForeground(STOP_FOREGROUND_REMOVE);
            } else {
                stopForeground(true);
            }
            stopSelf();
            if (session != null) session.setActive(false);
            return START_NOT_STICKY;
        }

        if (ACTION_REPOST.equals(action)) {
            Log.d(TAG, "  → ACTION_REPOST: re-asserting foreground with current state");
            startForeground(NOTIF_ID, buildNotification());
            return START_STICKY;
        }

        if (ACTION_UPDATE.equals(action)) {
            title   = str(intent, "title");
            artist  = str(intent, "artist");
            album   = str(intent, "album");
            playing = intent.getBooleanExtra("playing", false);
            posMs   = intent.getLongExtra("posMs", 0);
            durMs   = intent.getLongExtra("durMs", 0);

            Log.d(TAG, "  → ACTION_UPDATE: title='" + title + "' playing=" + playing);

            if (playing) {
                if (!noisyReceiverRegistered) {
                    IntentFilter noisyFilter =
                        new IntentFilter(AudioManager.ACTION_AUDIO_BECOMING_NOISY);
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                        registerReceiver(noisyReceiver, noisyFilter, Context.RECEIVER_NOT_EXPORTED);
                    } else {
                        registerReceiver(noisyReceiver, noisyFilter);
                    }
                    noisyReceiverRegistered = true;
                    Log.d(TAG, "     NoisyAudioReceiver registered");
                }
            } else {
                if (noisyReceiverRegistered) {
                    unregisterReceiver(noisyReceiver);
                    noisyReceiverRegistered = false;
                    Log.d(TAG, "     NoisyAudioReceiver unregistered");
                }
            }

            if (artworkUpdated) {
                artwork        = pendingArtwork;
                artworkUpdated = false;
                Log.d(TAG, "     artwork updated: " + (artwork != null ? artwork.getWidth() + "x" + artwork.getHeight() : "null"));
            }

            updateSession();

            Notification notif = buildNotification();
            Log.d(TAG, "  → calling startForeground with updated notification");
            startForeground(NOTIF_ID, notif);
            return START_STICKY;
        }

        Log.w(TAG, "  unhandled action: " + action);
        return START_STICKY;
    }

    @Override
    public IBinder onBind(Intent i) { return null; }

    @Override
    public void onDestroy() {
        super.onDestroy();
        Log.d(TAG, "=== MediaPlaybackService.onDestroy ===");
        if (noisyReceiverRegistered) {
            unregisterReceiver(noisyReceiver);
            noisyReceiverRegistered = false;
        }
        if (session != null) {
            session.setActive(false);
            session.release();
            session = null;
        }
    }

    // ── Init ──────────────────────────────────────────────────────────────────

    private void createChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel ch = new NotificationChannel(
                CHANNEL_ID, "Music Playback", NotificationManager.IMPORTANCE_LOW);
            ch.setDescription("Music playback controls");
            ch.setShowBadge(false);
            nm.createNotificationChannel(ch);
            Log.d(TAG, "  notification channel created: " + CHANNEL_ID);
        } else {
            Log.d(TAG, "  pre-Oreo — no channel needed");
        }
    }

    private void loadPlaceholder() {
        Bitmap src = BitmapFactory.decodeResource(getResources(), R.mipmap.ic_launcher);
        placeholder = (src != null)
            ? Bitmap.createScaledBitmap(src, 128, 128, true)
            : Bitmap.createBitmap(1, 1, Bitmap.Config.ARGB_8888);
        Log.d(TAG, "  placeholder loaded: " + placeholder.getWidth() + "x" + placeholder.getHeight());
    }

    private void initSession() {
        session = new MediaSessionCompat(this, "SplayerSession");
        session.setFlags(
            MediaSessionCompat.FLAG_HANDLES_MEDIA_BUTTONS |
            MediaSessionCompat.FLAG_HANDLES_TRANSPORT_CONTROLS);
        session.setCallback(new MediaSessionCompat.Callback() {
            @Override public void onPlay()           { Log.d(TAG, "session.onPlay");           dispatchMedia("play-pause"); }
            @Override public void onPause()          { Log.d(TAG, "session.onPause");          dispatchMedia("play-pause"); }
            @Override public void onSkipToNext()     { Log.d(TAG, "session.onSkipToNext");     dispatchMedia("next");       }
            @Override public void onSkipToPrevious() { Log.d(TAG, "session.onSkipToPrevious"); dispatchMedia("previous");   }
            @Override public void onStop()           { Log.d(TAG, "session.onStop");           dispatchMedia("stop");       }
        });
        session.setActive(true);
        Log.d(TAG, "  MediaSession created and active");
    }

    // ── Session metadata ──────────────────────────────────────────────────────

    private void updateSession() {
        session.setActive(true);
        Bitmap art = (artwork != null) ? artwork : placeholder;
        session.setMetadata(new MediaMetadataCompat.Builder()
            .putString(MediaMetadataCompat.METADATA_KEY_TITLE,  title.isEmpty()  ? "Splayer" : title)
            .putString(MediaMetadataCompat.METADATA_KEY_ARTIST, artist)
            .putString(MediaMetadataCompat.METADATA_KEY_ALBUM,  album)
            .putLong  (MediaMetadataCompat.METADATA_KEY_DURATION, durMs)
            .putBitmap(MediaMetadataCompat.METADATA_KEY_ALBUM_ART,    art)
            .putBitmap(MediaMetadataCompat.METADATA_KEY_DISPLAY_ICON, art)
            .build());

        int   state = playing ? PlaybackStateCompat.STATE_PLAYING : PlaybackStateCompat.STATE_PAUSED;
        float speed = playing ? 1f : 0f;
        session.setPlaybackState(new PlaybackStateCompat.Builder()
            .setActions(
                PlaybackStateCompat.ACTION_PLAY_PAUSE       |
                PlaybackStateCompat.ACTION_PLAY             |
                PlaybackStateCompat.ACTION_PAUSE            |
                PlaybackStateCompat.ACTION_SKIP_TO_NEXT     |
                PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS |
                PlaybackStateCompat.ACTION_STOP)
            .setState(state, posMs, speed, SystemClock.elapsedRealtime())
            .build());
    }

    // ── Notification ──────────────────────────────────────────────────────────

    private Notification buildNotification() {
        Log.d(TAG, "  buildNotification: title='" + title + "' playing=" + playing);

        PendingIntent openApp = PendingIntent.getActivity(
            this, 0,
            new Intent(this, MainActivity.class)
                .setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP),
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        PendingIntent prevPI = PendingIntent.getBroadcast(this, 10,
            new Intent(NotificationActionReceiver.ACTION_PREVIOUS)
                .setClass(this, NotificationActionReceiver.class),
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        PendingIntent playPausePI = PendingIntent.getBroadcast(this, 11,
            new Intent(NotificationActionReceiver.ACTION_PLAY_PAUSE)
                .setClass(this, NotificationActionReceiver.class),
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        PendingIntent nextPI = PendingIntent.getBroadcast(this, 12,
            new Intent(NotificationActionReceiver.ACTION_NEXT)
                .setClass(this, NotificationActionReceiver.class),
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        Bitmap largeIcon = (artwork != null) ? artwork : placeholder;

        // Use system media drawable IDs so Android renders proper icon-only buttons
        // in the MediaStyle compact view instead of text labels.
        int iconPrev      = android.R.drawable.ic_media_previous;
        int iconPlayPause = playing ? android.R.drawable.ic_media_pause
                                    : android.R.drawable.ic_media_play;
        int iconNext      = android.R.drawable.ic_media_next;

        Notification notif = new NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_notification)
            .setLargeIcon(largeIcon)
            .setContentTitle(title.isEmpty() ? "Splayer" : title)
            .setContentText(artist.isEmpty() ? null : artist)
            .setSubText(album.isEmpty() ? null : album)
            .setContentIntent(openApp)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setOngoing(true)
            .setShowWhen(false)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .addAction(new NotificationCompat.Action(iconPrev,      "Previous", prevPI))
            .addAction(new NotificationCompat.Action(iconPlayPause, playing ? "Pause" : "Play", playPausePI))
            .addAction(new NotificationCompat.Action(iconNext,      "Next", nextPI))
            .setStyle(new MediaStyle()
                .setMediaSession(session.getSessionToken())
                .setShowActionsInCompactView(0, 1, 2))
            .build();

        Log.d(TAG, "  notification built OK");
        return notif;
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private static String str(Intent i, String key) {
        String v = i.getStringExtra(key);
        return v != null ? v : "";
    }

    private void dispatchMedia(String action) {
        Log.d(TAG, "dispatchMedia: " + action
            + " plugin=" + (MediaSessionPlugin.instance != null ? "ok" : "NULL"));
        if (MediaSessionPlugin.instance != null) {
            MediaSessionPlugin.instance.onMediaButton(action);
        }
    }

    // ── Noisy audio (headphone disconnect) ───────────────────────────────────

    private class NoisyAudioReceiver extends BroadcastReceiver {
        @Override
        public void onReceive(Context context, Intent intent) {
            if (AudioManager.ACTION_AUDIO_BECOMING_NOISY.equals(intent.getAction())) {
                Log.d(TAG, "Headphone disconnected — pausing playback");
                dispatchMedia("play-pause");
            }
        }
    }
}
