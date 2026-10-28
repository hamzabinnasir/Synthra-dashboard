import '../../../core/api/api_client.dart';
import '../domain/chat_platform.dart';
import '../domain/conversation.dart';
import '../domain/global_bot_settings.dart';

/// Talks to the inbox-level endpoints: conversation list, bot switches, rename, read state, delete.
class InboxRepository {
  InboxRepository({required this._api});

  final ApiClient _api;

  Future<List<Conversation>> list(ChatPlatform platform) async {
    final json = await _api.get('/api/inbox/list', query: {'platform': platform.apiName});
    final rows = json['customers'];
    if (rows is! List) return const [];
    return [
      for (final row in rows)
        if (row is Map) Conversation.fromJson(Map<String, dynamic>.from(row)),
    ];
  }

  Future<GlobalBotSettings> globalSettings() async {
    final json = await _api.get('/api/facebook/global-settings');
    return GlobalBotSettings.fromJson(json);
  }

  Future<void> setGlobalBot(ChatPlatform platform, {required bool active}) async {
    await _api.post(
      '/api/facebook/global-settings',
      body: {'setting': platform.globalBotSetting, 'active': active},
    );
  }

  /// Turns the bot on/off for one conversation. WhatsApp and Facebook/Instagram use different routes.
  Future<void> setBotActive(Conversation conversation, {required bool active}) async {
    if (conversation.platform == ChatPlatform.whatsapp) {
      await _api.post('/api/toggle-bot', body: {'psid': conversation.psid, 'botActive': active});
    } else {
      await _api.post(
        '/api/facebook/toggle-bot',
        body: {'target': 'customer', 'id': conversation.psid, 'botActive': active},
      );
    }
  }

  /// Sets the dashboard-only display name. An empty name clears it. Returns the stored custom name.
  Future<String?> rename(String psid, String name) async {
    final json = await _api.post(
      '/api/conversation/edit-name',
      body: {'psid': psid, 'customName': name.trim()},
    );
    final stored = json['custom_name'];
    return stored is String && stored.isNotEmpty ? stored : null;
  }

  /// Resets the unread badge. Failures are not worth bothering the user with.
  Future<void> markRead(String psid) async {
    await _api.post('/api/conversation/mark-read', body: {'psid': psid});
  }

  /// Permanently removes the conversation and its messages/media from the dashboard.
  Future<void> deleteConversation(Conversation conversation) async {
    await _api.post(
      '/api/delete-conversation',
      body: {'psid': conversation.psid, 'platform': conversation.platform.apiName},
    );
  }
}
