package com.splayer.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.util.Log;
import android.widget.Toast;

/**
 * Receives taps on the Previous / Play-Pause / Next notification action buttons.
 *
 * Declared in AndroidManifest.xml with an explicit intent-filter for each action
 * string so the system can always deliver the broadcast, even if the app process
 * was temporarily suspended.
 *
 * The PendingIntents in MediaPlaybackService.buildNotification() use
 *   new Intent(ACTION_X).setClass(ctx, NotificationActionReceiver.class)
 * which creates fully explicit intents — no implicit-broadcast restrictions apply.
 */
public class NotificationActionReceiver extends BroadcastReceiver {

    private static final String TAG = "SplayerMedia";

    public static final String ACTION_PLAY_PAUSE = "com.splayer.app.ACTION_PLAY_PAUSE";
    public static final String ACTION_NEXT       = "com.splayer.app.ACTION_NEXT";
    public static final String ACTION_PREVIOUS   = "com.splayer.app.ACTION_PREVIOUS";

    @Override
    public void onReceive(Context context, Intent intent) {
        Toast.makeText(context, "Action: " + (intent != null ? intent.getAction() : "null"), Toast.LENGTH_SHORT).show();

        // ── Step 1: log immediately so we know the receiver was hit ──────────
        Log.d(TAG, "NotificationActionReceiver.onReceive called");

        if (intent == null) {
            Log.e(TAG, "  intent is null — ignoring");
            return;
        }

        final String action = intent.getAction();
        Log.d(TAG, "  action = " + action);

        if (action == null) {
            Log.e(TAG, "  action is null — ignoring");
            return;
        }

        // ── Step 2: map action string to media command ───────────────────────
        final String mediaCmd;
        switch (action) {
            case ACTION_PLAY_PAUSE: mediaCmd = "play-pause"; break;
            case ACTION_NEXT:       mediaCmd = "next";       break;
            case ACTION_PREVIOUS:   mediaCmd = "previous";   break;
            default:
                Log.w(TAG, "  unrecognized action — ignoring");
                return;
        }

        // ── Step 3: dispatch to JS via the Capacitor plugin ──────────────────
        Log.d(TAG, "  dispatching mediaCmd=" + mediaCmd
            + "  plugin=" + (MediaSessionPlugin.instance != null ? "ok" : "NULL"));

        if (MediaSessionPlugin.instance != null) {
            MediaSessionPlugin.instance.onMediaButton(mediaCmd);
            Log.d(TAG, "  dispatch done");
        } else {
            Log.e(TAG, "  MediaSessionPlugin.instance is NULL — button press lost!");
        }

        // ── Step 4: re-assert the foreground notification immediately ─────────
        //
        // notifyListeners() is async — JS won't call updateMediaSession until the
        // next event-loop tick.  On Android 12+ a foreground service without an
        // active notification is immediately demoted and the notification is
        // removed.  Sending ACTION_REPOST here re-posts the notification with the
        // service's current state RIGHT NOW, before JS has a chance to respond.
        // When JS does respond via updateMediaSession, the service is updated again
        // with the new track/play state.
        try {
            Intent repost = new Intent(context, MediaPlaybackService.class)
                .setAction(MediaPlaybackService.ACTION_REPOST);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(repost);
            } else {
                context.startService(repost);
            }
            Log.d(TAG, "  ACTION_REPOST sent to service");
        } catch (Exception e) {
            Log.e(TAG, "  failed to send ACTION_REPOST: " + e.getMessage());
        }
    }
}
