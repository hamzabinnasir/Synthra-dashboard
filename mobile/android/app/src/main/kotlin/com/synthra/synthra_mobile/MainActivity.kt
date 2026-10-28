package com.synthra.synthra_mobile

import android.app.NotificationChannel
import android.app.NotificationManager
import android.media.AudioAttributes
import android.media.RingtoneManager
import android.os.Build
import android.os.Bundle
import io.flutter.embedding.android.FlutterActivity

class MainActivity : FlutterActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        createAlertChannel()
    }

    /**
     * Android 8+ shows a notification only through a channel. Push messages from the server name this channel
     * ("synthra_alerts", see lib/fcm.js and AndroidManifest.xml). Creating it here with HIGH importance makes
     * new-message alerts pop up on screen with sound instead of landing silently in Firebase's fallback channel.
     * Creating an existing channel is a no-op, so this is safe to run on every start.
     */
    private fun createAlertChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val manager = getSystemService(NotificationManager::class.java) ?: return
        val channel = NotificationChannel(
            CHANNEL_ID,
            "Messages and comments",
            NotificationManager.IMPORTANCE_HIGH
        ).apply {
            description = "New customer messages, comments and requests for a human"
            enableVibration(true)
            setSound(
                RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION),
                AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_NOTIFICATION)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build()
            )
        }
        manager.createNotificationChannel(channel)
    }

    companion object {
        const val CHANNEL_ID = "synthra_alerts"
    }
}
