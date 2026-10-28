import 'chat_platform.dart';

/// Channel-wide bot switches (`bot_settings` row). A conversation's bot only runs when both its own
/// switch and the channel's global switch are on.
class GlobalBotSettings {
  const GlobalBotSettings(this._flags);

  /// Everything on: used until the server answers (matches the dashboard's defaults).
  const GlobalBotSettings.allOn() : _flags = const {};

  factory GlobalBotSettings.fromJson(Map<String, dynamic> json) {
    final raw = json['settings'];
    final flags = <String, bool>{};
    if (raw is Map) {
      for (final entry in raw.entries) {
        if (entry.value is bool) flags[entry.key.toString()] = entry.value as bool;
      }
    }
    return GlobalBotSettings(flags);
  }

  final Map<String, bool> _flags;

  bool isActive(ChatPlatform platform) => _flags[platform.globalBotSetting] ?? true;

  GlobalBotSettings withActive(ChatPlatform platform, bool active) {
    return GlobalBotSettings({..._flags, platform.globalBotSetting: active});
  }
}
