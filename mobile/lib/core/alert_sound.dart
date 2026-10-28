import 'package:flutter/foundation.dart';
import 'package:flutter_ringtone_player_plus/flutter_ringtone_player.dart';

/// Plays the device's default notification sound for an in-app alert.
///
/// Never throws: a missing sound or a platform problem must not break live notification handling.
Future<void> playAlertSound() async {
  try {
    await FlutterRingtonePlayer().playNotification();
  } catch (error) {
    debugPrint('Could not play alert sound: $error');
  }
}
