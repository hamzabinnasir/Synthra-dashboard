import '../../inbox/domain/chat_platform.dart';
import 'app_notification.dart';

/// The signed-in admin's notification preferences (`notification_settings`), shared with the web dashboard.
///
/// The server stores the whole row on every save, so every field is kept here (including the ones the
/// mobile app has no control for, like browser desktop notifications) and sent back unchanged.
class NotificationSettings {
  const NotificationSettings({
    this.soundEnabled = true,
    this.desktopEnabled = false,
    this.dndEnabled = false,
    this.popupEnabled = true,
    this.popupSeconds = 7,
    this.mutedPlatforms = const {},
    this.mutedTypes = const {},
  });

  factory NotificationSettings.fromJson(Map<String, dynamic> json) {
    Map<String, bool> flags(Object? raw) => {
          if (raw is Map) for (final entry in raw.entries) '${entry.key}': entry.value == true,
        };
    return NotificationSettings(
      soundEnabled: json['sound_enabled'] != false,
      desktopEnabled: json['desktop_enabled'] == true,
      dndEnabled: json['dnd_enabled'] == true,
      popupEnabled: json['popup_enabled'] != false,
      popupSeconds: (json['popup_seconds'] as num?)?.round() ?? 7,
      mutedPlatforms: flags(json['muted_platforms']),
      mutedTypes: flags(json['muted_types']),
    );
  }

  final bool soundEnabled;
  final bool desktopEnabled;

  /// Do not disturb: no in-app alerts at all.
  final bool dndEnabled;

  /// Show a banner when a notification arrives while the app is open.
  final bool popupEnabled;
  final int popupSeconds;
  final Map<String, bool> mutedPlatforms;
  final Map<String, bool> mutedTypes;

  bool isPlatformMuted(ChatPlatform platform) => mutedPlatforms[platform.apiName] == true;

  bool isTypeMuted(String type) => mutedTypes[type] == true;

  /// Whether a new notification should interrupt the user.
  bool shouldAlert(AppNotification notification) {
    return !dndEnabled && !isPlatformMuted(notification.platform) && !isTypeMuted(notification.type);
  }

  NotificationSettings withDnd(bool value) => _copy(dndEnabled: value);

  NotificationSettings withSound(bool value) => _copy(soundEnabled: value);

  NotificationSettings withPopup(bool value) => _copy(popupEnabled: value);

  NotificationSettings withPlatformMuted(ChatPlatform platform, bool muted) {
    return _copy(mutedPlatforms: {...mutedPlatforms, platform.apiName: muted});
  }

  NotificationSettings withTypeMuted(String type, bool muted) {
    return _copy(mutedTypes: {...mutedTypes, type: muted});
  }

  NotificationSettings _copy({
    bool? soundEnabled,
    bool? dndEnabled,
    bool? popupEnabled,
    Map<String, bool>? mutedPlatforms,
    Map<String, bool>? mutedTypes,
  }) {
    return NotificationSettings(
      soundEnabled: soundEnabled ?? this.soundEnabled,
      desktopEnabled: desktopEnabled,
      dndEnabled: dndEnabled ?? this.dndEnabled,
      popupEnabled: popupEnabled ?? this.popupEnabled,
      popupSeconds: popupSeconds,
      mutedPlatforms: mutedPlatforms ?? this.mutedPlatforms,
      mutedTypes: mutedTypes ?? this.mutedTypes,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'sound_enabled': soundEnabled,
      'desktop_enabled': desktopEnabled,
      'dnd_enabled': dndEnabled,
      'popup_enabled': popupEnabled,
      'popup_seconds': popupSeconds,
      'muted_platforms': {for (final platform in ChatPlatform.values) platform.apiName: isPlatformMuted(platform)},
      'muted_types': {for (final type in notificationTypes) type: isTypeMuted(type)},
    };
  }
}
