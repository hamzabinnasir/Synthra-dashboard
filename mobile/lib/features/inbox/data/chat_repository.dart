import 'package:dio/dio.dart';

import '../../../core/api/api_client.dart';
import '../domain/attachment.dart';
import '../domain/chat_message.dart';
import '../domain/chat_platform.dart';

/// Talks to the per-conversation endpoints (history, send, delete).
class ChatRepository {
  ChatRepository({required this._api});

  final ApiClient _api;

  /// WhatsApp history lives on its own route; Facebook and Instagram share another.
  String _messagesPath(String psid) => ChatPlatform.fromPsid(psid) == ChatPlatform.whatsapp
      ? '/api/conversation/$psid/messages'
      : '/api/facebook/inbox/${Uri.encodeComponent(psid)}/messages';

  /// Whole history (oldest first).
  Future<List<ChatMessage>> fetchAll(String psid) async {
    final json = await _api.get(_messagesPath(psid), query: {'full': '1'});
    return _parse(json);
  }

  /// Only messages newer than [after] (the server compares against `created_at`).
  Future<List<ChatMessage>> fetchAfter(String psid, DateTime after) async {
    final json = await _api.get(
      _messagesPath(psid),
      query: {'after': after.toUtc().toIso8601String()},
    );
    return _parse(json);
  }

  /// Sends a text message and returns the saved row when the server provides it.
  Future<ChatMessage?> sendText(String psid, String text) async {
    final Map<String, dynamic> json;
    if (ChatPlatform.fromPsid(psid) == ChatPlatform.whatsapp) {
      json = await _api.post('/api/send-message', body: {'psid': psid, 'message': text});
    } else {
      json = await _api.post(
        '/api/facebook/send-message',
        body: {'target': 'customer', 'id': psid, 'message': text},
      );
    }
    final saved = json['message'];
    return saved is Map ? ChatMessage.fromJson(Map<String, dynamic>.from(saved)) : null;
  }

  /// Uploads a photo / video / audio / document to a WhatsApp conversation (the only channel the dashboard
  /// can send media on). The server stores it, sends it through WhatsApp and returns the saved message row.
  Future<ChatMessage?> sendMedia(
    String psid,
    Attachment attachment, {
    String caption = '',
    void Function(int sent, int total)? onProgress,
  }) async {
    final form = FormData.fromMap({
      'psid': psid,
      'caption': caption,
      'file': await MultipartFile.fromFile(
        attachment.path,
        filename: attachment.name,
        contentType: DioMediaType.parse(attachment.mimeType),
      ),
    });
    final json = await _api.postForm('/api/send-media', form, onProgress: onProgress);
    final saved = json['message'];
    return saved is Map ? ChatMessage.fromJson(Map<String, dynamic>.from(saved)) : null;
  }

  Future<void> deleteMessage(int messageId, {required String psid}) async {
    await _api.post('/api/delete-message', body: {
      'messageId': messageId,
      // The server needs these to delete in the right database for Facebook / Instagram.
      'psid': psid,
      'platform': ChatPlatform.fromPsid(psid).name,
    });
  }

  /// Edits the text of a message we sent. Returns the time the server recorded for the edit.
  /// (Meta does not allow changing a delivered message, so this only changes the dashboard's copy.)
  Future<DateTime?> editMessage(int messageId, {required String psid, required String text}) async {
    final json = await _api.post('/api/edit-message', body: {
      'messageId': messageId,
      'psid': psid,
      'platform': ChatPlatform.fromPsid(psid).name,
      'text': text,
    });
    final editedAt = json['edited_at'];
    return editedAt is String ? DateTime.tryParse(editedAt)?.toLocal() : null;
  }

  List<ChatMessage> _parse(Map<String, dynamic> json) {
    final rows = json['messages'];
    if (rows is! List) return const [];
    return [
      for (final row in rows)
        if (row is Map) ChatMessage.fromJson(Map<String, dynamic>.from(row)),
    ];
  }
}
