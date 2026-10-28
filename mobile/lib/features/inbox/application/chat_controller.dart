import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/api_exception.dart';
import '../../../core/api/sse_client.dart';
import '../../../core/providers.dart';
import '../data/chat_repository.dart';
import '../domain/attachment.dart';
import '../domain/chat_message.dart';
import '../domain/chat_platform.dart';
import 'inbox_controller.dart';

final chatRepositoryProvider = Provider<ChatRepository>((ref) {
  return ChatRepository(api: ref.watch(apiClientProvider));
});

/// What the chat screen shows: the messages (oldest first) and whether the live connection is up.
class ChatThread {
  const ChatThread({required this.messages, required this.live});

  final List<ChatMessage> messages;
  final bool live;

  ChatThread copyWith({List<ChatMessage>? messages, bool? live}) {
    return ChatThread(messages: messages ?? this.messages, live: live ?? this.live);
  }
}

/// One chat thread, keyed by the conversation's psid.
///
/// Mirrors the web dashboard's `useConversationMessages`: load the full history, merge live messages
/// as they arrive, catch up on anything missed (reconnects, slow poll) and mark the chat as read.
final chatControllerProvider =
    AsyncNotifierProvider.autoDispose.family<ChatController, ChatThread, String>(
  ChatController.new,
);

class ChatController extends AsyncNotifier<ChatThread> {
  ChatController(this.psid);

  final String psid;

  ChatRepository get _repo => ref.read(chatRepositoryProvider);

  /// Messages deleted here or elsewhere must not come back from a slightly stale fetch.
  final Set<String> _deleted = {};

  /// Live messages that arrive before the first history load finishes.
  final List<ChatMessage> _early = [];

  Timer? _markTimer;
  bool _live = false;

  /// Sent messages older than this stop being re-checked for a "seen" receipt by the poll.
  static const _receiptWindow = Duration(days: 3);

  @override
  Future<ChatThread> build() async {
    final api = ref.watch(apiClientProvider);

    final events = sseStream(api.dio, '/api/conversation/${Uri.encodeComponent(psid)}/events')
        .listen(_onEvent);
    final poll = Timer.periodic(const Duration(seconds: 15), (_) => _catchUp());
    ref.onDispose(() {
      events.cancel();
      poll.cancel();
      _markTimer?.cancel();
    });

    final history = await _repo.fetchAll(psid);
    _scheduleMarkRead();
    return ChatThread(
      messages: mergeMessages(history, _early, deletedIds: _deleted),
      live: _live,
    );
  }

  void _onEvent(SseEvent event) {
    switch (event.name) {
      case 'ready':
        _setLive(true);
        unawaited(_catchUp());
      case sseDisconnected || 'realtime-error':
        _setLive(false);
      case 'new-message':
        final row = event.json;
        if (row == null) {
          unawaited(_catchUp());
          return;
        }
        final message = ChatMessage.fromJson(row);
        _merge([message]);
        if (message.isIncoming) _scheduleMarkRead();
      case 'message-updated':
        // Edits and delivery / "seen" receipts arrive here.
        final row = event.json;
        if (row != null) _merge([ChatMessage.fromJson(row)]);
      case 'message-deleted':
        final id = event.json?['id'];
        if (id != null) _removeKey(id.toString());
      case 'history-cleared':
        _deleted.clear();
        unawaited(_reload());
    }
  }

  void _setLive(bool value) {
    _live = value;
    final current = state.value;
    if (current != null && current.live != value) state = AsyncData(current.copyWith(live: value));
  }

  void _merge(List<ChatMessage> incoming) {
    final current = state.value;
    if (current == null) {
      _early.addAll(incoming);
      return;
    }
    state = AsyncData(
      current.copyWith(messages: mergeMessages(current.messages, incoming, deletedIds: _deleted)),
    );
  }

  void _removeKey(String key) {
    _deleted.add(key);
    final current = state.value;
    if (current == null) return;
    state = AsyncData(
      current.copyWith(messages: [
        for (final message in current.messages)
          if (message.key != key) message,
      ]),
    );
  }

  /// Fetches what is newer than the latest message we know (one-minute overlap). It also reaches back to the
  /// oldest recently sent message that has not been seen yet, so a late "seen" tick shows up even when the live
  /// connection missed it.
  Future<void> _catchUp() async {
    final current = state.value;
    if (current == null) return;
    try {
      final messages = current.messages;
      final List<ChatMessage> fresh;
      if (messages.isEmpty) {
        fresh = await _repo.fetchAll(psid);
      } else {
        final now = DateTime.now();
        var since = messages.last.createdAt.subtract(const Duration(minutes: 1));
        for (final message in messages) {
          final waiting = !message.isIncoming &&
              message.deliveryState != DeliveryState.read &&
              message.deliveryState != DeliveryState.failed &&
              now.difference(message.createdAt) < _receiptWindow;
          if (waiting && message.createdAt.isBefore(since)) {
            since = message.createdAt.subtract(const Duration(seconds: 1));
          }
        }
        fresh = await _repo.fetchAfter(psid, since);
      }
      if (ref.mounted && fresh.isNotEmpty) _merge(fresh);
    } on ApiException {
      // The next poll or reconnect tries again.
    }
  }

  Future<void> _reload() async {
    try {
      final all = await _repo.fetchAll(psid);
      if (!ref.mounted) return;
      state = AsyncData(ChatThread(messages: mergeMessages(const [], all), live: _live));
    } on ApiException {
      // Keep what is on screen.
    }
  }

  void _scheduleMarkRead() {
    _markTimer?.cancel();
    _markTimer = Timer(const Duration(milliseconds: 400), () async {
      try {
        await ref.read(inboxRepositoryProvider).markRead(psid);
      } on ApiException {
        return; // The unread badge is cosmetic; do not nag the user.
      }
      if (!ref.mounted) return;
      final inbox = inboxControllerProvider(ChatPlatform.fromPsid(psid));
      if (ref.exists(inbox)) ref.read(inbox.notifier).markReadLocal(psid);
    });
  }

  /// Uploads a photo / video / audio / document (WhatsApp only). Throws [ApiException] on failure.
  Future<void> sendMedia(
    Attachment attachment, {
    String caption = '',
    void Function(int sent, int total)? onProgress,
  }) async {
    final saved = await _repo.sendMedia(psid, attachment, caption: caption.trim(), onProgress: onProgress);
    if (!ref.mounted) return;
    if (saved != null) {
      _merge([saved]);
    } else {
      unawaited(_catchUp());
    }
  }

  /// Sends a text message. Throws [ApiException] with a user-facing message on failure.
  Future<void> send(String text) async {
    final saved = await _repo.sendText(psid, text.trim());
    if (!ref.mounted) return;
    if (saved != null) {
      _merge([saved]);
    } else {
      unawaited(_catchUp());
    }
  }

  /// Deletes one message on the server (and its media), then removes it from the screen.
  /// Throws [ApiException] on failure.
  Future<void> deleteMessage(ChatMessage message) async {
    final id = message.id;
    if (id == null) return;
    await _repo.deleteMessage(id, psid: psid);
    if (ref.mounted) _removeKey(message.key);
  }

  /// Changes the text of a message we sent. The platforms do not allow editing a delivered message, so this only
  /// changes the copy in the dashboard. Throws [ApiException] on failure.
  Future<void> editMessage(ChatMessage message, String newText) async {
    final id = message.id;
    final text = newText.trim();
    if (id == null || text.isEmpty || text == message.text) return;
    final editedAt = await _repo.editMessage(id, psid: psid, text: text);
    if (!ref.mounted) return;
    _merge([message.copyWithText(text, editedAt ?? DateTime.now())]);
  }
}
