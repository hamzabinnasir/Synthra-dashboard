import '../../../core/api/api_client.dart';
import '../../inbox/domain/chat_platform.dart';
import '../domain/app_notification.dart';
import '../domain/notification_settings.dart';

/// What `GET /api/notifications` returns: the newest notifications and the total unread count.
class NotificationsSnapshot {
  const NotificationsSnapshot({required this.items, required this.unreadCount});

  final List<AppNotification> items;
  final int unreadCount;
}

/// Talks to the `/api/notifications` endpoints.
class NotificationsRepository {
  NotificationsRepository({required this._api});

  final ApiClient _api;

  /// The newest [limit] notifications (the server allows at most 100), newest first.
  Future<NotificationsSnapshot> list({int limit = 100}) async {
    final json = await _api.get('/api/notifications', query: {'limit': limit});
    final rows = json['notifications'];
    return NotificationsSnapshot(
      items: [
        if (rows is List)
          for (final row in rows)
            if (row is Map) AppNotification.fromJson(Map<String, dynamic>.from(row)),
      ],
      unreadCount: (json['unread_count'] as num?)?.toInt() ?? 0,
    );
  }

  Future<void> markRead(Object id) async {
    await _api.patch('/api/notifications', body: {'id': id, 'is_read': true});
  }

  /// Marks everything read, or only one channel's notifications.
  Future<void> markAllRead({ChatPlatform? platform}) async {
    await _api.post('/api/notifications/mark-all-read', body: {'platform': platform?.apiName ?? 'all'});
  }

  Future<void> delete(Object id) async {
    await _api.delete('/api/notifications', body: {'id': id});
  }

  Future<void> clearAll() async {
    await _api.delete('/api/notifications', body: {'clear_all': true});
  }

  Future<NotificationSettings> loadSettings() async {
    final json = await _api.get('/api/notifications/settings');
    final settings = json['settings'];
    return settings is Map
        ? NotificationSettings.fromJson(Map<String, dynamic>.from(settings))
        : const NotificationSettings();
  }

  Future<NotificationSettings> saveSettings(NotificationSettings settings) async {
    final json = await _api.post('/api/notifications/settings', body: settings.toJson());
    final saved = json['settings'];
    return saved is Map ? NotificationSettings.fromJson(Map<String, dynamic>.from(saved)) : settings;
  }
}
