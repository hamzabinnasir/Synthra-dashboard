import 'dart:async';
import 'dart:io';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'api/api_client.dart';
import 'api/api_exception.dart';
import 'providers.dart';

/// Outcome of [PushService.sendTest]: [message] is written for the user, in plain words.
class PushTestResult {
  const PushTestResult({required this.ok, required this.message});

  final bool ok;
  final String message;
}

/// What a tapped push notification points at (the `data` fields the server sends).
class PushTap {
  const PushTap({this.sourceType, this.targetId});

  /// `comment` for comment notifications, otherwise a message-like source.
  final String? sourceType;

  /// Conversation id (psid) for messages, comment id for comments.
  final String? targetId;

  bool get isComment => sourceType == 'comment';

  factory PushTap.fromData(Map<String, dynamic> data) {
    String? text(Object? value) {
      final result = value?.toString().trim();
      return (result == null || result.isEmpty) ? null : result;
    }

    return PushTap(sourceType: text(data['source_type']), targetId: text(data['target_id']));
  }
}

final pushServiceProvider = Provider<PushService>((ref) {
  final service = PushService(api: ref.watch(apiClientProvider));
  ref.onDispose(service.dispose);
  return service;
});

/// Firebase Cloud Messaging for background alerts: registers this phone with the dashboard so the server can
/// push new-message / comment alerts when the app is closed. While the app is open, live events (SSE) already
/// show banners and play sounds, so foreground pushes are ignored.
///
/// Every method is safe to call when Firebase is not configured: it logs and does nothing instead of crashing.
class PushService {
  PushService({required this._api});

  final ApiClient _api;

  final _taps = StreamController<PushTap>.broadcast();
  StreamSubscription<String>? _refreshSub;
  StreamSubscription<RemoteMessage>? _openedSub;
  String? _registeredToken;
  bool _started = false;

  /// Notifications the user tapped (app in the background, or the one that launched the app).
  Stream<PushTap> get taps => _taps.stream;

  /// Initialises Firebase once, at app start. Returns false when Firebase is not set up for this build.
  static Future<bool> initializeFirebase() async {
    try {
      await Firebase.initializeApp();
      return true;
    } catch (error) {
      debugPrint('Firebase is not configured, push alerts are off: $error');
      return false;
    }
  }

  /// Asks for notification permission and registers this device. Call after sign-in.
  Future<void> start() async {
    if (_started || Firebase.apps.isEmpty) return;
    _started = true;
    try {
      final messaging = FirebaseMessaging.instance;
      final settings = await messaging.requestPermission();
      if (settings.authorizationStatus == AuthorizationStatus.denied) {
        debugPrint('Notification permission denied, push alerts are off.');
      }

      await _register(await messaging.getToken());
      _refreshSub = messaging.onTokenRefresh.listen((token) => unawaited(_register(token)));

      _openedSub = FirebaseMessaging.onMessageOpenedApp.listen(_emitTap);
      final initial = await messaging.getInitialMessage();
      if (initial != null) _emitTap(initial);
    } catch (error) {
      _started = false;
      debugPrint('Could not start push alerts: $error');
    }
  }

  void _emitTap(RemoteMessage message) => _taps.add(PushTap.fromData(message.data));

  /// Runs the whole push chain once and explains, in plain words, where it breaks:
  /// Firebase in this build -> notification permission -> phone registered on the server -> server key -> delivery.
  /// A real test notification is sent to this phone when everything is in place.
  Future<PushTestResult> sendTest() async {
    if (Firebase.apps.isEmpty) {
      return const PushTestResult(
        ok: false,
        message: 'Firebase is not set up in this build (google-services.json missing or wrong). Rebuild the app.',
      );
    }
    try {
      final messaging = FirebaseMessaging.instance;
      var settings = await messaging.getNotificationSettings();
      if (settings.authorizationStatus == AuthorizationStatus.notDetermined) {
        settings = await messaging.requestPermission();
      }
      if (settings.authorizationStatus == AuthorizationStatus.denied) {
        return const PushTestResult(
          ok: false,
          message: 'Notifications are blocked for Synthra. Open Android Settings > Apps > Synthra > Notifications and allow them.',
        );
      }

      final token = await messaging.getToken();
      if (token == null || token.isEmpty) {
        return const PushTestResult(
          ok: false,
          message: 'Firebase did not give this phone a token. Check the internet connection and Google Play services, then try again.',
        );
      }
      _registeredToken = null; // Force a fresh registration so the server certainly knows this phone.
      await _register(token);
      if (_registeredToken != token) {
        return const PushTestResult(
          ok: false,
          message: 'This phone could not be registered on the server. Make sure the device_tokens table exists (run supabase/migrations/20261026_device_tokens.sql).',
        );
      }

      final json = await _api.post('/api/push/test');
      final checks = json['checks'];
      final secretOk = checks is Map && checks['webhook_secret_configured'] == true;
      return PushTestResult(
        ok: true,
        message: secretOk
            ? 'A test notification was sent. If it does not appear within a few seconds, close the app and send it again (alerts are hidden while the app is open).'
            : 'A test notification was sent, but PUSH_WEBHOOK_SECRET is not set on the server, so real message alerts will NOT be sent yet.',
      );
    } on ApiException catch (error) {
      return PushTestResult(ok: false, message: error.message);
    } catch (error) {
      return PushTestResult(ok: false, message: 'Push test failed: $error');
    }
  }


  Future<void> _register(String? token) async {
    if (token == null || token.isEmpty || token == _registeredToken) return;
    try {
      await _api.post('/api/devices', body: {'token': token, 'platform': Platform.isIOS ? 'ios' : 'android'});
      _registeredToken = token;
    } catch (error) {
      debugPrint('Could not register this device for push alerts: $error');
    }
  }

  /// Stops alerts for this phone. Call BEFORE the session token is cleared (the server needs it).
  Future<void> unregister() async {
    await _refreshSub?.cancel();
    await _openedSub?.cancel();
    _refreshSub = null;
    _openedSub = null;
    _started = false;
    if (Firebase.apps.isEmpty) return;
    try {
      final token = _registeredToken ?? await FirebaseMessaging.instance.getToken();
      if (token != null) await _api.delete('/api/devices', body: {'token': token});
      await FirebaseMessaging.instance.deleteToken();
    } catch (error) {
      debugPrint('Could not unregister this device: $error');
    }
    _registeredToken = null;
  }

  void dispose() {
    unawaited(_refreshSub?.cancel());
    unawaited(_openedSub?.cancel());
    unawaited(_taps.close());
  }
}
