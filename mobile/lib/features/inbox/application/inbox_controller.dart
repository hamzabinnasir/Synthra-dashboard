import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/api_exception.dart';
import '../../../core/api/sse_client.dart';
import '../../../core/providers.dart';
import '../data/inbox_repository.dart';
import '../domain/chat_platform.dart';
import '../domain/conversation.dart';
import '../domain/global_bot_settings.dart';

final inboxRepositoryProvider = Provider<InboxRepository>((ref) {
  return InboxRepository(api: ref.watch(apiClientProvider));
});

/// The conversation list of one channel, kept fresh by the server's live events (with a slow poll as a
/// safety net). Every event just triggers a quiet re-fetch, so the list always matches the server.
final inboxControllerProvider =
    AsyncNotifierProvider.autoDispose.family<InboxController, List<Conversation>, ChatPlatform>(
  InboxController.new,
);

class InboxController extends AsyncNotifier<List<Conversation>> {
  InboxController(this.platform);

  final ChatPlatform platform;

  InboxRepository get _repo => ref.read(inboxRepositoryProvider);

  Timer? _debounce;

  @override
  Future<List<Conversation>> build() async {
    final api = ref.watch(apiClientProvider);

    final events = sseStream(
      api.dio,
      '/api/inbox/events',
      query: {'platform': platform.apiName},
    ).listen(_onEvent);
    final poll = Timer.periodic(const Duration(seconds: 30), (_) => refresh());
    ref.onDispose(() {
      events.cancel();
      poll.cancel();
      _debounce?.cancel();
    });

    return _repo.list(platform);
  }

  void _onEvent(SseEvent event) {
    switch (event.name) {
      case sseDisconnected:
        return;
      case 'customer-deleted':
        final psid = event.json?['psid'];
        if (psid is String) _remove(psid);
      case 'all-conversations-deleted':
        state = const AsyncData(<Conversation>[]);
      default:
        break;
    }
    // Several events usually arrive together (new message + customer update): fetch once.
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 500), refresh);
  }

  /// Re-fetches the list. If it fails while a list is already shown, the old list stays on screen.
  Future<void> refresh() async {
    try {
      final items = await _repo.list(platform);
      if (ref.mounted) state = AsyncData(items);
    } on ApiException catch (error, stackTrace) {
      if (ref.mounted && !state.hasValue) state = AsyncError(error, stackTrace);
    }
  }

  void _patch(String psid, Conversation Function(Conversation) change) {
    final current = state.value;
    if (current == null) return;
    state = AsyncData([for (final item in current) item.psid == psid ? change(item) : item]);
  }

  void _remove(String psid) {
    final current = state.value;
    if (current == null) return;
    state = AsyncData([
      for (final item in current)
        if (item.psid != psid) item,
    ]);
  }

  /// Clears the unread badge on screen right away (the chat screen tells the server separately).
  void markReadLocal(String psid) => _patch(psid, (item) => item.copyWith(unreadCount: 0));

  /// Throws [ApiException] on failure after restoring the previous value.
  Future<void> setBotActive(Conversation conversation, bool active) async {
    _patch(conversation.psid, (item) => item.copyWith(botActive: active));
    try {
      await _repo.setBotActive(conversation, active: active);
    } on ApiException {
      if (ref.mounted) {
        _patch(conversation.psid, (item) => item.copyWith(botActive: conversation.botActive));
      }
      rethrow;
    }
  }

  /// An empty [name] removes the custom name. Throws [ApiException] on failure.
  Future<void> rename(Conversation conversation, String name) async {
    final stored = await _repo.rename(conversation.psid, name);
    if (ref.mounted) _patch(conversation.psid, (item) => item.copyWith(customName: stored));
  }

  /// Throws [ApiException] on failure.
  Future<void> delete(Conversation conversation) async {
    await _repo.deleteConversation(conversation);
    if (ref.mounted) _remove(conversation.psid);
  }
}

/// Channel-wide bot switches. While loading (or if the server cannot provide them) everything counts as on.
final globalBotProvider = AsyncNotifierProvider<GlobalBotController, GlobalBotSettings>(
  GlobalBotController.new,
);

class GlobalBotController extends AsyncNotifier<GlobalBotSettings> {
  InboxRepository get _repo => ref.read(inboxRepositoryProvider);

  @override
  Future<GlobalBotSettings> build() => _repo.globalSettings();

  /// Throws [ApiException] on failure after restoring the previous value.
  Future<void> setActive(ChatPlatform platform, bool active) async {
    final before = state.value ?? const GlobalBotSettings.allOn();
    state = AsyncData(before.withActive(platform, active));
    try {
      await _repo.setGlobalBot(platform, active: active);
    } on ApiException {
      if (ref.mounted) state = AsyncData(before);
      rethrow;
    }
  }
}
