import '../../inbox/domain/chat_platform.dart';

/// `notifications.type` values the dashboard raises.
const notificationTypes = ['human_request', 'inbox', 'comment', 'media'];

String notificationTypeLabel(String type) {
  switch (type) {
    case 'human_request':
      return 'Human requested';
    case 'inbox':
      return 'Messages';
    case 'comment':
      return 'Comments';
    case 'media':
      return 'Media';
  }
  return type;
}

/// How a notification is presented (same rules as the web notification center).
enum NotificationKind { urgent, media, comment, message }

/// One row of the `notifications` table.
class AppNotification {
  const AppNotification({
    required this.id,
    required this.platform,
    required this.type,
    this.sourceType,
    this.targetId,
    this.customerId,
    this.customerName,
    this.customerUsername,
    this.preview = '',
    this.isRead = false,
    this.createdAt,
  });

  factory AppNotification.fromJson(Map<String, dynamic> json) {
    final targetId = _text(json['target_id']);
    return AppNotification(
      id: json['id'] ?? '',
      platform: ChatPlatform.fromPsid(targetId ?? '', platform: json['platform'] as String?),
      type: _text(json['type']) ?? 'inbox',
      sourceType: _text(json['source_type']),
      targetId: targetId,
      customerId: _text(json['customer_id']),
      customerName: _text(json['customer_name']),
      customerUsername: _text(json['customer_username']),
      preview: (json['message_preview'] as String?)?.trim() ?? '',
      isRead: json['is_read'] == true,
      createdAt: _parseDate(json['created_at']),
    );
  }

  /// Database id, sent back to the server exactly as received (it may be a number).
  final Object id;
  final ChatPlatform platform;
  final String type;

  /// `comment` for comment notifications, otherwise a message-like source.
  final String? sourceType;

  /// Conversation id (psid) for messages, comment id for comments.
  final String? targetId;
  final String? customerId;
  final String? customerName;
  final String? customerUsername;
  final String preview;
  final bool isRead;
  final DateTime? createdAt;

  String get key => '$id';

  bool get isComment => sourceType == 'comment';

  NotificationKind get kind {
    if (type == 'human_request') return NotificationKind.urgent;
    if (type == 'media') return NotificationKind.media;
    if (isComment) return NotificationKind.comment;
    return NotificationKind.message;
  }

  String get displayName => customerName ?? customerUsername ?? customerId ?? 'New contact';

  /// Handle shown under the name when the name itself is a real name.
  String? get handle {
    final username = customerUsername;
    if (username == null || customerName == null) return null;
    return '@${username.replaceFirst(RegExp(r'^@'), '')}';
  }

  String get initials {
    final parts = displayName
        .replaceFirst(RegExp(r'^@'), '')
        .trim()
        .split(RegExp(r'\s+'))
        .where((part) => part.isNotEmpty)
        .toList();
    if (parts.isEmpty) return '?';
    final letters = parts.length == 1 ? parts.first.substring(0, parts.first.length.clamp(1, 2)) : parts[0][0] + parts[1][0];
    return letters.toUpperCase();
  }

  AppNotification copyWith({bool? isRead}) {
    return AppNotification(
      id: id,
      platform: platform,
      type: type,
      sourceType: sourceType,
      targetId: targetId,
      customerId: customerId,
      customerName: customerName,
      customerUsername: customerUsername,
      preview: preview,
      isRead: isRead ?? this.isRead,
      createdAt: createdAt,
    );
  }
}

String? _text(Object? value) {
  final text = value?.toString().trim();
  return (text == null || text.isEmpty) ? null : text;
}

DateTime? _parseDate(Object? value) {
  if (value is! String) return null;
  return DateTime.tryParse(value)?.toLocal();
}
