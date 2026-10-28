import 'dart:async';
import 'dart:math' as math;

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/alert_sound.dart';
import '../../../core/api/api_exception.dart';
import '../../../core/api/sse_client.dart';
import '../../../core/providers.dart';
import '../../inbox/domain/chat_platform.dart';
import '../data/notifications_repository.dart';
import '../domain/app_notification.dart';
import '../domain/notification_settings.dart';

final notificationsRepositoryProvider = Provider<NotificationsRepository>((ref) {
  return NotificationsRepository(api: ref.watch(apiClientProvider));
});

/// The admin's notification preferences. Shared with the web dashboard, so changes made there apply here.
final notificationSettingsProvider =
    AsyncNotifierProvider.autoDispose<NotificationSettingsController, NotificationSettings>(
  NotificationSettingsController.new,
);

class NotificationSettingsController extends AsyncNotifier<NotificationSettings> {
  @override
  Future<NotificationSettings> build() => ref.read(notificationsRepositoryProvider).loadSettings();

  /// Applies [next] at once and saves it. Restores the previous settings and rethrows if saving fails.
  Future<void> save(NotificationSettings next) async {
    final before = state.value;
    state = AsyncData(next);
    try {
      final saved = await ref.read(notificationsRepositoryProvider).saveSettings(next);
      if (ref.mounted) state = AsyncData(saved);
    } on ApiException {
      if (ref.mounted && before != null) state = AsyncData(before);
      rethrow;
    }
  }
}

/// What the notification list shows.
class NotificationsState {
  const NotificationsState({
    required this.items,
    required this.unreadCount,
    required this.live,
    this.incoming,
  });

  /// Newest first (at most the latest 100 from the server, plus any that arrived live).
  final List<AppNotification> items;

  /// Unread notifications in total, including ones older than [items].
  final int unreadCount;

  /// Whether the live connection is up.
  final bool live;

  /// The latest notification that arrived while the app was open and should be announced (not muted).
  final AppNotification? incoming;

  NotificationsState copyWith({
    List<AppNotification>? items,
    int? unreadCount,
    bool? live,
    AppNotification? incoming,
  }) {
    return NotificationsState(
      items: items ?? this.items,
      unreadCount: unreadCount ?? this.unreadCount,
      live: live ?? this.live,
      incoming: incoming ?? this.incoming,
    );
  }
}

/// Notification center data, kept fresh by the server's live events (while the app is open) and a slow poll.
///
/// It lives as long as the signed-in home screen does, so the unread badge is always current.
final notificationsControllerProvider =
    AsyncNotifierProvider.autoDispose<NotificationsController, NotificationsState>(
  NotificationsController.new,
);

class NotificationsController extends AsyncNotifier<NotificationsState> {
  static const _maxItems = 200;

  NotificationsRepository get _repo => ref.read(notificationsRepositoryProvider);

  bool _live = false;

  @override
  Future<NotificationsState> build() async {
    final api = ref.watch(apiClientProvider);

    final events = sseStream(api.dio, '/api/notifications/events').listen(_onEvent);
    final poll = Timer.periodic(const Duration(seconds: 30), (_) => unawaited(refresh()));
    ref.onDispose(() {
      events.cancel();
      poll.cancel();
    });

    final snapshot = await _repo.list();
    return NotificationsState(items: snapshot.items, unreadCount: snapshot.unreadCount, live: _live);
  }

  void _onEvent(SseEvent event) {
    switch (event.name) {
      case 'ready':
        _setLive(true);
      case sseDisconnected || 'realtime-error':
        _setLive(false);
      case 'new-notification':
        final json = event.json;
        if (json != null) _onNew(AppNotification.fromJson(json));
      case 'notification-updated':
        final json = event.json;
        if (json != null) _onUpdated(AppNotification.fromJson(json));
      case 'notification-deleted':
        final id = event.json?['id'];
        if (id != null) _onDeleted('$id');
    }
  }

  void _setLive(bool value) {
    _live = value;
    final current = state.value;
    if (current != null && current.live != value) state = AsyncData(current.copyWith(live: value));
  }

  void _apply(NotificationsState Function(NotificationsState) change) {
    final current = state.value;
    if (current == null) return;
    state = AsyncData(change(current));
  }

  void _onNew(AppNotification item) {
    final settings = ref.read(notificationSettingsProvider).value ?? const NotificationSettings();
    _apply((current) {
      if (current.items.any((existing) => existing.key == item.key)) return current;
      if (settings.soundEnabled && settings.shouldAlert(item) && !item.isRead) {
        unawaited(playAlertSound());
      }
      final items = [item, ...current.items];
      return current.copyWith(
        items: items.length > _maxItems ? items.sublist(0, _maxItems) : items,
        unreadCount: item.isRead ? current.unreadCount : current.unreadCount + 1,
        incoming: settings.popupEnabled && settings.shouldAlert(item) && !item.isRead ? item : null,
      );
    });
  }

  void _onUpdated(AppNotification item) {
    _apply((current) {
      final previous = current.items.where((existing) => existing.key == item.key).firstOrNull;
      if (previous == null) return current;
      var unread = current.unreadCount;
      if (previous.isRead && !item.isRead) unread++;
      if (!previous.isRead && item.isRead) unread = math.max(0, unread - 1);
      return current.copyWith(
        items: [for (final existing in current.items) existing.key == item.key ? item : existing],
        unreadCount: unread,
      );
    });
  }

  void _onDeleted(String key) {
    _apply((current) {
      final removed = current.items.where((existing) => existing.key == key).firstOrNull;
      if (removed == null) return current;
      return current.copyWith(
        items: [for (final existing in current.items) if (existing.key != key) existing],
        unreadCount: removed.isRead ? current.unreadCount : math.max(0, current.unreadCount - 1),
      );
    });
  }

  /// Re-fetches the list. If it fails while a list is already shown, the old list stays on screen.
  Future<void> refresh() async {
    try {
      final snapshot = await _repo.list();
      if (!ref.mounted) return;
      state = AsyncData(
        NotificationsState(
          items: snapshot.items,
          unreadCount: snapshot.unreadCount,
          live: _live,
          incoming: state.value?.incoming,
        ),
      );
    } on ApiException catch (error, stackTrace) {
      if (ref.mounted && !state.hasValue) state = AsyncError(error, stackTrace);
    }
  }

  /// Marks one notification read. Restores it and rethrows [ApiException] on failure.
  Future<void> markRead(AppNotification item) async {
    final before = state.value;
    if (before == null || item.isRead) return;
    _apply((current) {
      return current.copyWith(
        items: [for (final existing in current.items) existing.key == item.key ? existing.copyWith(isRead: true) : existing],
        unreadCount: math.max(0, current.unreadCount - 1),
      );
    });
    try {
      await _repo.markRead(item.id);
    } on ApiException {
      if (ref.mounted) state = AsyncData(before);
      rethrow;
    }
  }

  /// Marks everything read, or only one channel's notifications. Restores and rethrows on failure.
  Future<void> markAllRead({ChatPlatform? platform}) async {
    final before = state.value;
    if (before == null) return;
    bool matches(AppNotification item) => platform == null || item.platform == platform;
    _apply((current) {
      final cleared = current.items.where((item) => !item.isRead && matches(item)).length;
      return current.copyWith(
        items: [for (final item in current.items) matches(item) ? item.copyWith(isRead: true) : item],
        unreadCount: platform == null ? 0 : math.max(0, current.unreadCount - cleared),
      );
    });
    try {
      await _repo.markAllRead(platform: platform);
    } on ApiException {
      if (ref.mounted) state = AsyncData(before);
      rethrow;
    }
  }

  /// Deletes one notification. Restores it and rethrows on failure.
  Future<void> delete(AppNotification item) async {
    final before = state.value;
    if (before == null) return;
    _onDeleted(item.key);
    try {
      await _repo.delete(item.id);
    } on ApiException {
      if (ref.mounted) state = AsyncData(before);
      rethrow;
    }
  }

  /// Deletes every notification. Restores the list and rethrows on failure.
  Future<void> clearAll() async {
    final before = state.value;
    if (before == null) return;
    _apply((current) => current.copyWith(items: const [], unreadCount: 0));
    try {
      await _repo.clearAll();
    } on ApiException {
      if (ref.mounted) state = AsyncData(before);
      rethrow;
    }
  }
}

/// Which notifications the list shows. Filtering happens on the loaded list, so it is instant.
class NotificationFilter {
  const NotificationFilter({this.platform, this.type, this.unreadOnly = false});

  final ChatPlatform? platform;

  /// One of [notificationTypes], or null for all.
  final String? type;
  final bool unreadOnly;

  List<AppNotification> apply(List<AppNotification> items) {
    return [
      for (final item in items)
        if ((platform == null || item.platform == platform) &&
            (type == null || item.type == type) &&
            (!unreadOnly || !item.isRead))
          item,
    ];
  }
}

final notificationFilterProvider =
    NotifierProvider<NotificationFilterController, NotificationFilter>(NotificationFilterController.new);

class NotificationFilterController extends Notifier<NotificationFilter> {
  @override
  NotificationFilter build() => const NotificationFilter();

  void setPlatform(ChatPlatform? platform) {
    state = NotificationFilter(platform: platform, type: state.type, unreadOnly: state.unreadOnly);
  }

  void setType(String? type) {
    state = NotificationFilter(platform: state.platform, type: type, unreadOnly: state.unreadOnly);
  }

  void toggleUnreadOnly() {
    state = NotificationFilter(platform: state.platform, type: state.type, unreadOnly: !state.unreadOnly);
  }
}
