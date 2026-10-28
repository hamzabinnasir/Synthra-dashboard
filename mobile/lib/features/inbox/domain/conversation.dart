import 'chat_platform.dart';

/// Headline / sub-headline / initials shown for a conversation or commenter.
class DisplayTitles {
  const DisplayTitles({required this.headline, required this.subHeadline, required this.initials});

  final String headline;
  final String subHeadline;
  final String initials;
}

final _idPrefix = RegExp(r'^(ig_|wa_)');
final _idPrefixAnyCase = RegExp(r'^(ig_|wa_)', caseSensitive: false);
final _longDigits = RegExp(r'^\d{5,}$');
final _leadingAt = RegExp(r'^@');

/// True when [value] is empty or is just the customer's numeric/prefixed id rather than a real name.
/// (Port of `looksLikeCustomerId` in `lib/conversation-helpers.js`.)
bool looksLikeCustomerId(String? value, String psid) {
  final raw = (value ?? '').trim();
  if (raw.isEmpty) return true;
  final clean = psid.replaceFirst(_idPrefix, '');
  if (raw == psid || raw == clean) return true;
  if (_idPrefixAnyCase.hasMatch(raw)) return true;
  if (_longDigits.hasMatch(raw)) return true;
  return false;
}

String _formatHandle(String username, ChatPlatform platform) {
  final value = username.trim().replaceFirst(_leadingAt, '');
  if (value.isEmpty) return '';
  if (platform == ChatPlatform.whatsapp || _longDigits.hasMatch(value)) return value;
  return '@$value';
}

String _initialsFor(String? text) {
  final cleaned = (text == null || text.isEmpty) ? '??' : text.replaceFirst(_leadingAt, '');
  return String.fromCharCodes(cleaned.runes.take(2)).toUpperCase();
}

/// One row of the inbox (a row of the `customers` table).
class Conversation {
  const Conversation({
    required this.psid,
    required this.platform,
    this.name = '',
    this.customName,
    this.username = '',
    this.profilePicUrl,
    this.botActive = false,
    this.lastMessageText,
    this.lastActivityAt,
    this.unreadCount = 0,
  });

  factory Conversation.fromJson(Map<String, dynamic> json) {
    final psid = (json['psid'] ?? '').toString();
    return Conversation(
      psid: psid,
      platform: ChatPlatform.fromPsid(psid, platform: json['platform'] as String?),
      name: (json['name'] as String?) ?? '',
      customName: _nonEmpty(json['custom_name']),
      username: (json['username'] as String?) ?? '',
      profilePicUrl: _nonEmpty(json['profile_pic_url']),
      botActive: json['bot_active'] == true,
      lastMessageText: _nonEmpty(json['last_message_text']),
      lastActivityAt: _parseDate(json['last_activity_at'] ?? json['created_at']),
      unreadCount: (json['unread_count'] is num) ? (json['unread_count'] as num).toInt() : 0,
    );
  }

  final String psid;
  final ChatPlatform platform;
  final String name;
  final String? customName;
  final String username;
  final String? profilePicUrl;

  /// This conversation's own bot switch (the channel's global switch is separate).
  final bool botActive;
  final String? lastMessageText;
  final DateTime? lastActivityAt;
  final int unreadCount;

  /// Priority: custom dashboard name, then real profile name, then username/phone, then the id.
  DisplayTitles get titles {
    final custom = (customName ?? '').trim();
    final stored = name.trim();
    final realName = looksLikeCustomerId(stored, psid) ? '' : stored;
    final handle = _formatHandle(username, platform);
    final cleanId = psid.replaceFirst(_idPrefix, '');

    if (custom.isNotEmpty) {
      final parts = <String>[
        if (realName.isNotEmpty && realName != custom) realName,
        if (handle.isNotEmpty) handle,
      ];
      return DisplayTitles(
        headline: custom,
        subHeadline: parts.join(' · '),
        initials: _initialsFor(custom),
      );
    }
    if (realName.isNotEmpty) {
      return DisplayTitles(headline: realName, subHeadline: handle, initials: _initialsFor(realName));
    }
    if (handle.isNotEmpty) {
      return DisplayTitles(headline: handle, subHeadline: '', initials: _initialsFor(handle));
    }
    return DisplayTitles(
      headline: cleanId.isEmpty ? 'Unknown customer' : cleanId,
      subHeadline: '',
      initials: _initialsFor(cleanId),
    );
  }

  Conversation copyWith({
    Object? customName = _keep,
    bool? botActive,
    int? unreadCount,
  }) {
    return Conversation(
      psid: psid,
      platform: platform,
      name: name,
      customName: identical(customName, _keep) ? this.customName : customName as String?,
      username: username,
      profilePicUrl: profilePicUrl,
      botActive: botActive ?? this.botActive,
      lastMessageText: lastMessageText,
      lastActivityAt: lastActivityAt,
      unreadCount: unreadCount ?? this.unreadCount,
    );
  }
}

const Object _keep = Object();

String? _nonEmpty(Object? value) {
  if (value is! String) return null;
  final trimmed = value.trim();
  return trimmed.isEmpty ? null : trimmed;
}

DateTime? _parseDate(Object? value) {
  if (value is! String) return null;
  return DateTime.tryParse(value)?.toLocal();
}
