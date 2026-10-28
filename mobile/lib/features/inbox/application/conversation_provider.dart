import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../domain/chat_platform.dart';
import '../domain/conversation.dart';
import 'inbox_controller.dart';

/// The inbox row for one conversation id, or null while the list loads or if it is not among the rows
/// the server returned (the inbox shows the 100 most recent conversations).
///
/// Watching this keeps the channel's inbox controller alive, so rename / bot / delete from the chat
/// screen update the list underneath it immediately.
final conversationProvider = Provider.autoDispose.family<Conversation?, String>((ref, psid) {
  final rows = ref.watch(inboxControllerProvider(ChatPlatform.fromPsid(psid))).value;
  if (rows == null) return null;
  for (final row in rows) {
    if (row.psid == psid) return row;
  }
  return null;
});
