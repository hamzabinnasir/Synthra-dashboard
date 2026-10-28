import '../../../core/api/api_client.dart';
import '../../inbox/domain/chat_platform.dart';
import '../domain/comment.dart';

/// What `GET /api/comments` returns: the newest comments (max 100) and the channel's comment-bot switch.
class CommentsSnapshot {
  const CommentsSnapshot({required this.comments, required this.botActive});

  final List<Comment> comments;
  final bool botActive;
}

/// Talks to the comment-moderation endpoints (Facebook and Instagram comments).
class CommentsRepository {
  CommentsRepository({required this._api});

  final ApiClient _api;

  Future<CommentsSnapshot> list(ChatPlatform platform) async {
    final json = await _api.get('/api/comments', query: {'platform': platform.apiName});
    final rows = json['comments'];
    return CommentsSnapshot(
      comments: [
        if (rows is List)
          for (final row in rows)
            if (row is Map)
              Comment.fromJson(Map<String, dynamic>.from(row), fallbackPlatform: platform),
      ],
      botActive: json['bot_active'] == true,
    );
  }

  /// Replies to a comment, either publicly under it or as a private inbox message.
  ///
  /// Returns a warning to show the user (e.g. the private message went out but the public
  /// "check your inbox" note could not be posted), or null.
  ///
  /// Server errors worth knowing: 409 = the single allowed private reply was already used,
  /// 410 = the comment no longer exists on the platform (the server has already removed it).
  Future<String?> reply(String commentId, String text, {required bool isPrivate}) async {
    final json = await _api.post(
      '/api/facebook/send-message',
      body: {
        'target': 'comment',
        'id': commentId,
        'message': text,
        'mode': isPrivate ? 'private' : 'public',
      },
    );
    final warning = json['warning'];
    return warning is String && warning.isNotEmpty ? warning : null;
  }

  /// Deletes the comment on Facebook/Instagram (when possible) and from the dashboard.
  Future<void> delete(String commentId) async {
    await _api.post('/api/facebook/delete-comment', body: {'commentId': commentId});
  }

  /// Asks the server to check the newest comments against Meta and drop the ones deleted there.
  /// Returns the ids that were removed.
  Future<List<String>> sync(ChatPlatform platform) async {
    final json = await _api.post('/api/comments/sync', body: {'platform': platform.apiName});
    final removed = json['removed'];
    return [
      if (removed is List)
        for (final id in removed)
          if (id is String) id,
    ];
  }

  /// Pauses / resumes the automatic comment replies for the whole channel.
  Future<void> setBotActive(ChatPlatform platform, {required bool active}) async {
    await _api.post(
      '/api/facebook/global-settings',
      body: {'setting': platform.commentBotSetting, 'active': active},
    );
  }
}
