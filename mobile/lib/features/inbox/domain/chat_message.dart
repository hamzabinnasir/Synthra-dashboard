enum MessageSender { customer, human, bot }

enum MediaKind { image, video, audio, document }

/// How far a message we sent has travelled: sent -> delivered -> read ("seen").
enum DeliveryState { none, sent, delivered, read, failed }

final _imageUrl = RegExp(r'\.(jpe?g|png|webp|gif|svg|bmp)(\?.*)?$', caseSensitive: false);
final _videoUrl = RegExp(r'\.(mp4|webm|mov|m4v|ogv)(\?.*)?$', caseSensitive: false);
final _audioUrl = RegExp(r'\.(mp3|ogg|wav|m4a|aac|opus)(\?.*)?$', caseSensitive: false);

/// One row of the `messages` table.
class ChatMessage {
  const ChatMessage({
    required this.sender,
    required this.createdAt,
    this.id,
    this.text = '',
    this.mediaUrl,
    this.mediaType,
    this.mediaMimeType,
    this.mediaFilename,
    this.mediaStatus,
    this.deliveryStatus,
    this.deliveredAt,
    this.readAt,
    this.editedAt,
  });

  factory ChatMessage.fromJson(Map<String, dynamic> json) {
    final sender = switch (json['sender']) {
      'customer' => MessageSender.customer,
      'human' => MessageSender.human,
      _ => MessageSender.bot,
    };
    String? text(Object? value) {
      if (value is! String) return null;
      return value.trim().isEmpty ? null : value;
    }

    DateTime? date(Object? value) => value is String ? DateTime.tryParse(value)?.toLocal() : null;

    return ChatMessage(
      id: json['id'] == null ? null : int.tryParse(json['id'].toString()),
      sender: sender,
      text: (json['text'] as String?) ?? '',
      createdAt: DateTime.tryParse((json['created_at'] ?? '').toString())?.toLocal() ??
          DateTime.fromMillisecondsSinceEpoch(0),
      mediaUrl: text(json['media_url']),
      mediaType: text(json['media_type']),
      mediaMimeType: text(json['media_mime_type']),
      mediaFilename: text(json['media_filename']),
      mediaStatus: text(json['media_status']),
      deliveryStatus: text(json['delivery_status']),
      deliveredAt: date(json['delivered_at']),
      readAt: date(json['read_at']),
      editedAt: date(json['edited_at']),
    );
  }

  final int? id;
  final MessageSender sender;
  final String text;
  final DateTime createdAt;
  final String? mediaUrl;
  final String? mediaType;
  final String? mediaMimeType;
  final String? mediaFilename;
  final String? mediaStatus;

  /// Receipt data for messages WE sent (null on customer messages and before the first receipt arrives).
  final String? deliveryStatus;
  final DateTime? deliveredAt;
  final DateTime? readAt;

  /// Set when an agent edited the text in the dashboard.
  final DateTime? editedAt;

  bool get isIncoming => sender == MessageSender.customer;

  bool get isEdited => editedAt != null;

  /// What the customer's side has done with this message. Only meaningful for [isIncoming] == false.
  DeliveryState get deliveryState {
    if (isIncoming) return DeliveryState.none;
    if (readAt != null || deliveryStatus == 'read') return DeliveryState.read;
    if (deliveredAt != null || deliveryStatus == 'delivered') return DeliveryState.delivered;
    return switch (deliveryStatus) {
      'failed' => DeliveryState.failed,
      'sent' => DeliveryState.sent,
      _ => DeliveryState.none,
    };
  }

  /// Only text we sent (bot or agent) can be edited, never what the customer wrote.
  bool get canEdit => !isIncoming && id != null && text.isNotEmpty && !mediaUnavailable;

  ChatMessage copyWithText(String newText, DateTime editedAt) {
    return ChatMessage(
      id: id,
      sender: sender,
      text: newText,
      createdAt: createdAt,
      mediaUrl: mediaUrl,
      mediaType: mediaType,
      mediaMimeType: mediaMimeType,
      mediaFilename: mediaFilename,
      mediaStatus: mediaStatus,
      deliveryStatus: deliveryStatus,
      deliveredAt: deliveredAt,
      readAt: readAt,
      editedAt: editedAt,
    );
  }

  /// Stable identity used to merge live and fetched copies of the same message.
  /// Uses the id when there is one, so editing the text does not change a message's identity.
  String get key => id?.toString() ?? '${createdAt.microsecondsSinceEpoch}|$text';

  bool get hasMedia => mediaUrl != null || mediaType != null;

  /// The platform link expired or the upload failed, so there is nothing to show.
  bool get mediaUnavailable => mediaUrl == '__media_unavailable__' || mediaStatus == 'failed';

  MediaKind? get mediaKind {
    if (!hasMedia) return null;
    final type = (mediaType ?? '').toLowerCase();
    final mime = (mediaMimeType ?? '').toLowerCase();
    final url = mediaUrl ?? '';
    if (type == 'image' || mime.startsWith('image/') || _imageUrl.hasMatch(url)) return MediaKind.image;
    if (type == 'video' || mime.startsWith('video/') || _videoUrl.hasMatch(url)) return MediaKind.video;
    if (type == 'audio' || type == 'voice' || mime.startsWith('audio/') || _audioUrl.hasMatch(url)) {
      return MediaKind.audio;
    }
    return MediaKind.document;
  }

  /// Short text for notifications / previews, e.g. "[Image]".
  String get preview {
    if (text.isNotEmpty) return text;
    return switch (mediaKind) {
      MediaKind.image => '[Image]',
      MediaKind.video => '[Video]',
      MediaKind.audio => '[Audio]',
      MediaKind.document => '[Document]',
      null => '',
    };
  }
}

/// Oldest first; ties broken by id (same rule as the web dashboard).
int compareMessages(ChatMessage a, ChatMessage b) {
  final byTime = a.createdAt.compareTo(b.createdAt);
  if (byTime != 0) return byTime;
  return (a.id ?? 0).compareTo(b.id ?? 0);
}

/// Merges [incoming] into [current]: no duplicates, ids in [deletedIds] stay deleted.
List<ChatMessage> mergeMessages(
  List<ChatMessage> current,
  Iterable<ChatMessage> incoming, {
  Set<String> deletedIds = const {},
}) {
  final byKey = <String, ChatMessage>{for (final message in current) message.key: message};
  for (final message in incoming) {
    if (deletedIds.contains(message.key)) continue;
    byKey[message.key] = message;
  }
  return byKey.values.toList()..sort(compareMessages);
}
