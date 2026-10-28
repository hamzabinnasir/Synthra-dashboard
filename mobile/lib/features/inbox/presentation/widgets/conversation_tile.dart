import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../domain/conversation.dart';
import '../formatters.dart';
import 'common.dart';
import 'conversation_actions.dart';

/// One row of the inbox. Tap opens the chat; long-press (or the menu) offers rename / bot / delete.
class ConversationTile extends ConsumerWidget {
  const ConversationTile({super.key, required this.conversation, required this.globalBotActive});

  final Conversation conversation;

  /// Whether the channel-wide bot switch is on (the row's own switch only matters when it is).
  final bool globalBotActive;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final titles = conversation.titles;
    final unread = conversation.unreadCount;
    final botRunning = globalBotActive && conversation.botActive;

    return InkWell(
      onTap: () => context.push('/chat/${Uri.encodeComponent(conversation.psid)}'),
      onLongPress: () => _showActions(context, ref),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
        child: Row(
          children: [
            ContactAvatar(initials: titles.initials, imageUrl: conversation.profilePicUrl),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    titles.headline,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: theme.textTheme.titleMedium?.copyWith(
                      fontWeight: unread > 0 ? FontWeight.w800 : FontWeight.w600,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    conversation.lastMessageText ?? 'No messages yet',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      color: unread > 0 ? scheme.onSurface : scheme.onSurfaceVariant,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(width: 10),
            Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Text(
                  formatListTime(conversation.lastActivityAt),
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: unread > 0 ? scheme.primary : scheme.onSurfaceVariant,
                  ),
                ),
                const SizedBox(height: 6),
                Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Tooltip(
                      message: botRunning ? 'Bot is active' : 'Bot is off',
                      child: Icon(
                        botRunning ? Icons.smart_toy_rounded : Icons.smart_toy_outlined,
                        size: 18,
                        color: botRunning ? scheme.primary : scheme.onSurfaceVariant,
                      ),
                    ),
                    if (unread > 0) ...[
                      const SizedBox(width: 8),
                      _UnreadBadge(count: unread),
                    ],
                  ],
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  void _showActions(BuildContext context, WidgetRef ref) {
    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      builder: (sheetContext) {
        final scheme = Theme.of(sheetContext).colorScheme;
        return SafeArea(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              ListTile(
                title: Text(conversation.titles.headline, maxLines: 1, overflow: TextOverflow.ellipsis),
                subtitle: Text(conversation.platform.label),
              ),
              ListTile(
                leading: const Icon(Icons.edit_outlined),
                title: const Text('Edit display name'),
                onTap: () {
                  Navigator.pop(sheetContext);
                  renameConversationFlow(context, ref, conversation);
                },
              ),
              ListTile(
                leading: const Icon(Icons.smart_toy_outlined),
                title: Text(conversation.botActive ? 'Turn bot off here' : 'Turn bot on here'),
                subtitle: globalBotActive ? null : const Text('The bot is paused for the whole channel'),
                onTap: () {
                  Navigator.pop(sheetContext);
                  toggleConversationBot(context, ref, conversation, !conversation.botActive);
                },
              ),
              ListTile(
                leading: Icon(Icons.delete_outline_rounded, color: scheme.error),
                title: Text('Delete conversation', style: TextStyle(color: scheme.error)),
                onTap: () {
                  Navigator.pop(sheetContext);
                  deleteConversationFlow(context, ref, conversation);
                },
              ),
            ],
          ),
        );
      },
    );
  }
}

class _UnreadBadge extends StatelessWidget {
  const _UnreadBadge({required this.count});

  final int count;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      constraints: const BoxConstraints(minWidth: 20),
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      decoration: BoxDecoration(color: scheme.primary, borderRadius: BorderRadius.circular(10)),
      child: Text(
        count > 99 ? '99+' : '$count',
        textAlign: TextAlign.center,
        style: TextStyle(color: scheme.onPrimary, fontSize: 12, fontWeight: FontWeight.w700),
      ),
    );
  }
}
