import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/api_exception.dart';
import '../../../core/api/sse_client.dart';
import '../../../core/providers.dart';
import '../../inbox/domain/chat_platform.dart';
import '../data/comments_repository.dart';
import '../domain/comment.dart';

final commentsRepositoryProvider = Provider<CommentsRepository>((ref) {
  return CommentsRepository(api: ref.watch(apiClientProvider));
});

/// What the comments screen shows for one channel.
class CommentsState {
  const CommentsState({required this.comments, required this.botActive, required this.live});

  /// Newest first.
  final List<Comment> comments;

  /// The channel's comment-bot switch (`comment_bot_active` / `instagram_comment_bot_active`).
  final bool botActive;

  /// Whether the live connection is up.
  final bool live;

  CommentsState copyWith({List<Comment>? comments, bool? botActive, bool? live}) {
    return CommentsState(
      comments: comments ?? this.comments,
      botActive: botActive ?? this.botActive,
      live: live ?? this.live,
    );
  }
}

/// The comments of one channel (Facebook or Instagram), kept fresh by the server's live events.
///
/// Like the inbox, most events just trigger a quiet re-fetch so the list always matches the server
/// (authors and replies are joined server-side). Deletions are applied locally at once. Because comments
/// can also be deleted directly on Facebook/Instagram, a slow poll asks the server to verify against Meta.
final commentsControllerProvider =
    AsyncNotifierProvider.autoDispose.family<CommentsController, CommentsState, ChatPlatform>(
  CommentsController.new,
);

class CommentsController extends AsyncNotifier<CommentsState> {
  CommentsController(this.platform);

  final ChatPlatform platform;

  CommentsRepository get _repo => ref.read(commentsRepositoryProvider);

  Timer? _debounce;
  bool _live = false;

  @override
  Future<CommentsState> build() async {
    final api = ref.watch(apiClientProvider);

    final events = sseStream(
      api.dio,
      '/api/comments/events',
      query: {'platform': platform.apiName},
    ).listen(_onEvent);
    final poll = Timer.periodic(const Duration(seconds: 30), (_) {
      unawaited(_syncWithPlatform());
      unawaited(refresh());
    });
    ref.onDispose(() {
      events.cancel();
      poll.cancel();
      _debounce?.cancel();
    });

    final snapshot = await _repo.list(platform);
    return CommentsState(comments: snapshot.comments, botActive: snapshot.botActive, live: _live);
  }

  void _onEvent(SseEvent event) {
    switch (event.name) {
      case 'ready':
        _setLive(true);
        return;
      case sseDisconnected || 'realtime-error':
        _setLive(false);
        return;
      case 'comment-deleted':
        final id = event.json?['comment_id'];
        if (id is String) _removeIds({id});
        return;
      case 'all-comments-deleted':
        final target = event.json?['platform'];
        if (target == null || target == platform.apiName) _patchComments((_) => const []);
        return;
      case 'comment-updated':
        final json = event.json;
        if (json != null && isDeletedCommentAction(json['action'] as String?)) {
          final id = json['comment_id'];
          if (id is String) _removeIds({id});
          return;
        }
      case 'new-comment' || 'author-updated':
        break;
      default:
        return;
    }
    // Several events usually arrive together (new comment + author + reply): fetch once.
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 600), refresh);
  }

  void _setLive(bool value) {
    _live = value;
    final current = state.value;
    if (current != null && current.live != value) state = AsyncData(current.copyWith(live: value));
  }

  /// Re-fetches the list. If it fails while a list is already shown, the old list stays on screen.
  Future<void> refresh() async {
    try {
      final snapshot = await _repo.list(platform);
      if (!ref.mounted) return;
      state = AsyncData(
        CommentsState(comments: snapshot.comments, botActive: snapshot.botActive, live: _live),
      );
    } on ApiException catch (error, stackTrace) {
      if (ref.mounted && !state.hasValue) state = AsyncError(error, stackTrace);
    }
  }

  /// Removes comments that were deleted directly on Facebook/Instagram.
  Future<void> _syncWithPlatform() async {
    try {
      final removed = await _repo.sync(platform);
      if (ref.mounted && removed.isNotEmpty) _removeIds(removed.toSet());
    } on ApiException {
      // Best effort: the next poll tries again.
    }
  }

  void _patchComments(List<Comment> Function(List<Comment>) change) {
    final current = state.value;
    if (current == null) return;
    state = AsyncData(current.copyWith(comments: change(current.comments)));
  }

  void _patchOne(String commentId, Comment Function(Comment) change) {
    _patchComments((comments) => [
          for (final comment in comments) comment.commentId == commentId ? change(comment) : comment,
        ]);
  }

  void _removeIds(Set<String> ids) {
    _patchComments((comments) => [
          for (final comment in comments)
            if (!ids.contains(comment.commentId)) comment,
        ]);
  }

  /// Replies to [comment]. A private reply goes to the commenter's inbox and can only be sent once per comment.
  /// Returns a warning to show (or null). Throws [ApiException] on failure.
  Future<String?> reply(Comment comment, String text, {required bool isPrivate}) async {
    final String? warning;
    try {
      warning = await _repo.reply(comment.commentId, text.trim(), isPrivate: isPrivate);
    } on ApiException catch (error) {
      if (ref.mounted) {
        if (error.statusCode == 409 && isPrivate) {
          _patchOne(comment.commentId, (item) => item.copyWith(privateReplySent: true));
        } else if (error.statusCode == 410) {
          _removeIds({comment.commentId}); // The server already dropped it: the comment is gone.
        }
      }
      rethrow;
    }
    if (!ref.mounted) return warning;

    final sent = CommentReply(
      id: 'local-${DateTime.now().microsecondsSinceEpoch}',
      isPrivate: isPrivate,
      byBot: false,
      text: text.trim(),
      createdAt: DateTime.now(),
    );
    _patchOne(
      comment.commentId,
      (item) => item.copyWith(
        privateReplySent: isPrivate ? true : item.privateReplySent,
        replies: [...item.replies, sent],
      ),
    );
    // Pull the real reply row (and the comment's new status) from the server.
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 800), refresh);
    return warning;
  }

  /// Deletes on Facebook/Instagram and in the dashboard. Throws [ApiException] on failure.
  Future<void> delete(Comment comment) async {
    await _repo.delete(comment.commentId);
    if (ref.mounted) _removeIds({comment.commentId});
  }

  /// Pauses / resumes automatic comment replies for the channel. Restores the switch and rethrows on failure.
  Future<void> setBotActive(bool active) async {
    final before = state.value;
    if (before == null) return;
    state = AsyncData(before.copyWith(botActive: active));
    try {
      await _repo.setBotActive(platform, active: active);
    } on ApiException {
      if (ref.mounted) {
        final current = state.value;
        if (current != null) state = AsyncData(current.copyWith(botActive: before.botActive));
      }
      rethrow;
    }
  }
}
