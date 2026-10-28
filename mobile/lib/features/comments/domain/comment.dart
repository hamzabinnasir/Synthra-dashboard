import '../../inbox/domain/chat_platform.dart';
import '../../inbox/domain/conversation.dart';

/// The two channels that have comment moderation.
const commentPlatforms = [ChatPlatform.facebook, ChatPlatform.instagram];

extension CommentPlatform on ChatPlatform {
  /// Key in the dashboard's `bot_settings` row that pauses the comment bot for this channel.
  String get commentBotSetting =>
      this == ChatPlatform.instagram ? 'instagram_comment_bot_active' : 'comment_bot_active';
}

/// Actions that mean the comment no longer exists on the platform / in the dashboard.
const _deletedActions = {'deleted_by_admin', 'deleted_from_facebook', 'deleted_from_instagram'};

bool isDeletedCommentAction(String? action) => _deletedActions.contains(action);

/// One reply already sent to a comment (public comment reply or private inbox message).
class CommentReply {
  const CommentReply({
    required this.id,
    required this.isPrivate,
    required this.byBot,
    required this.text,
    this.createdAt,
  });

  /// Server shape: `{ id, kind: 'public' | 'private', by: 'bot' | 'human', text, created_at }`.
  factory CommentReply.fromJson(Map<String, dynamic> json) {
    return CommentReply(
      id: (json['id'] ?? '').toString(),
      isPrivate: json['kind'] == 'private',
      byBot: json['by'] == 'bot',
      text: (json['text'] as String?)?.trim() ?? '',
      createdAt: _parseDate(json['created_at']),
    );
  }

  final String id;
  final bool isPrivate;
  final bool byBot;
  final String text;
  final DateTime? createdAt;
}

/// One row of the `comments` table, enriched by `GET /api/comments` with the author's profile,
/// the replies already sent, and whether a private reply was used up.
class Comment {
  const Comment({
    required this.commentId,
    required this.platform,
    this.postId,
    this.fromId,
    this.fromName,
    this.message = '',
    this.classification,
    this.action,
    this.createdAt,
    this.privateReplySent = false,
    this.authorPicUrl,
    this.authorCustomName,
    this.authorStoredName,
    this.authorStoredUsername,
    this.replies = const [],
  });

  factory Comment.fromJson(Map<String, dynamic> json, {required ChatPlatform fallbackPlatform}) {
    final rawReplies = json['replies'];
    return Comment(
      commentId: (json['comment_id'] ?? '').toString(),
      platform: ChatPlatform.fromPsid(
        (json['from_id'] ?? '').toString(),
        platform: json['platform'] as String? ?? fallbackPlatform.apiName,
      ),
      postId: _nonEmpty(json['post_id']),
      fromId: _nonEmpty(json['from_id']),
      fromName: _nonEmpty(json['from_name']),
      message: (json['message'] as String?) ?? '',
      classification: _nonEmpty(json['classification']) ?? _nonEmpty(json['tone']),
      action: _nonEmpty(json['action']),
      createdAt: _parseDate(json['created_at']),
      privateReplySent: json['private_reply_sent'] == true,
      authorPicUrl: _nonEmpty(json['author_pic_url']),
      authorCustomName: _nonEmpty(json['author_custom_name']),
      authorStoredName: _nonEmpty(json['author_stored_name']),
      authorStoredUsername: _nonEmpty(json['author_stored_username']),
      replies: [
        if (rawReplies is List)
          for (final reply in rawReplies)
            if (reply is Map) CommentReply.fromJson(Map<String, dynamic>.from(reply)),
      ],
    );
  }

  final String commentId;
  final ChatPlatform platform;
  final String? postId;

  /// The commenter's id; also the psid of their conversation in the inbox.
  final String? fromId;
  final String? fromName;
  final String message;

  /// What the bot decided the comment is (sentiment/intent), e.g. `positive`, `question`.
  final String? classification;

  /// What was done about it, e.g. `private_reply_sent`, `deleted_by_admin`.
  final String? action;
  final DateTime? createdAt;
  final bool privateReplySent;
  final String? authorPicUrl;
  final String? authorCustomName;
  final String? authorStoredName;
  final String? authorStoredUsername;

  /// Oldest first.
  final List<CommentReply> replies;

  /// Same naming rules as inbox conversations: custom name, then real name, then username, then id.
  DisplayTitles get titles {
    return Conversation(
      psid: fromId ?? '',
      platform: platform,
      name: authorStoredName ?? fromName ?? '',
      customName: authorCustomName,
      username: authorStoredUsername ?? '',
    ).titles;
  }

  Comment copyWith({
    String? action,
    bool? privateReplySent,
    List<CommentReply>? replies,
  }) {
    return Comment(
      commentId: commentId,
      platform: platform,
      postId: postId,
      fromId: fromId,
      fromName: fromName,
      message: message,
      classification: classification,
      action: action ?? this.action,
      createdAt: createdAt,
      privateReplySent: privateReplySent ?? this.privateReplySent,
      authorPicUrl: authorPicUrl,
      authorCustomName: authorCustomName,
      authorStoredName: authorStoredName,
      authorStoredUsername: authorStoredUsername,
      replies: replies ?? this.replies,
    );
  }
}

/// `private_reply_sent` -> `Private reply sent`.
String humanize(String? value) {
  final text = (value ?? '').replaceAll('_', ' ').trim();
  if (text.isEmpty) return '';
  return text[0].toUpperCase() + text.substring(1);
}

String? _nonEmpty(Object? value) {
  if (value is! String) return null;
  final trimmed = value.trim();
  return trimmed.isEmpty ? null : trimmed;
}

DateTime? _parseDate(Object? value) {
  if (value is! String) return null;
  return DateTime.tryParse(value)?.toLocal();
}
