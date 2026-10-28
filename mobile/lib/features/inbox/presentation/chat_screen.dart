import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../application/chat_controller.dart';
import '../application/conversation_provider.dart';
import '../application/inbox_controller.dart';
import '../domain/chat_message.dart';
import '../domain/chat_platform.dart';
import '../domain/conversation.dart';
import '../domain/global_bot_settings.dart';
import 'formatters.dart';
import 'widgets/attachment_flow.dart';
import 'widgets/common.dart';
import 'widgets/conversation_actions.dart';
import 'widgets/message_bubble.dart';
import 'widgets/message_composer.dart';

/// One conversation: history, live updates, reply box, bot switch, rename and delete.
class ChatScreen extends ConsumerWidget {
  const ChatScreen({super.key, required this.psid});

  final String psid;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final platform = ChatPlatform.fromPsid(psid);
    final conversation = ref.watch(conversationProvider(psid));
    final thread = ref.watch(chatControllerProvider(psid));
    final global = ref.watch(globalBotProvider).value ?? const GlobalBotSettings.allOn();

    final shown = conversation ?? Conversation(psid: psid, platform: platform);
    final titles = shown.titles;
    final globalActive = global.isActive(platform);
    final live = thread.value?.live ?? false;

    final subtitleParts = <String>[
      if (titles.subHeadline.isNotEmpty) titles.subHeadline,
      if (thread.hasValue) (live ? 'Live' : 'Reconnecting…'),
    ];

    return Scaffold(
      appBar: AppBar(
        titleSpacing: 0,
        title: Row(
          children: [
            ContactAvatar(initials: titles.initials, imageUrl: shown.profilePicUrl, size: 38),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    titles.headline,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
                  ),
                  if (subtitleParts.isNotEmpty)
                    Text(
                      subtitleParts.join(' · '),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        fontSize: 12,
                        color: Theme.of(context).colorScheme.onSurfaceVariant,
                      ),
                    ),
                ],
              ),
            ),
          ],
        ),
        actions: [
          if (conversation != null)
            Tooltip(
              message: globalActive
                  ? (conversation.botActive ? 'Bot is on for this chat' : 'Bot is off for this chat')
                  : 'Bot is paused for the whole channel',
              child: Switch(
                value: globalActive && conversation.botActive,
                onChanged: globalActive
                    ? (value) => toggleConversationBot(context, ref, conversation, value)
                    : null,
              ),
            ),
          if (conversation != null)
            PopupMenuButton<String>(
              onSelected: (value) async {
                if (value == 'rename') {
                  await renameConversationFlow(context, ref, conversation);
                } else if (value == 'delete') {
                  final deleted = await deleteConversationFlow(context, ref, conversation);
                  if (deleted && context.mounted) context.pop();
                }
              },
              itemBuilder: (_) => const [
                PopupMenuItem(value: 'rename', child: Text('Edit display name')),
                PopupMenuItem(value: 'delete', child: Text('Delete conversation')),
              ],
            ),
        ],
      ),
      body: Column(
        children: [
          Expanded(
            child: thread.when(
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (error, _) => ErrorView(
                message: errorText(error),
                onRetry: () => ref.invalidate(chatControllerProvider(psid)),
              ),
              data: (data) => data.messages.isEmpty
                  ? const EmptyView(
                      icon: Icons.chat_bubble_outline_rounded,
                      title: 'No messages yet',
                      subtitle: 'Messages in this conversation will appear here.',
                    )
                  : _MessageList(psid: psid, messages: data.messages),
            ),
          ),
          MessageComposer(
            maxLength: platform.messageLimit,
            hint: 'Reply on ${platform.label}',
            onSend: (text) => ref.read(chatControllerProvider(psid).notifier).send(text),
            // Only WhatsApp supports sending media from the dashboard.
            onAttach: platform == ChatPlatform.whatsapp
                ? () => pickAndSendAttachment(context, ref, psid)
                : null,
          ),
        ],
      ),
    );
  }
}

class _MessageList extends ConsumerWidget {
  const _MessageList({required this.psid, required this.messages});

  final String psid;
  final List<ChatMessage> messages;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // Oldest first, with a heading wherever the day changes.
    final entries = <Object>[];
    DateTime? previous;
    for (final message in messages) {
      if (previous == null || !isSameDay(previous, message.createdAt)) entries.add(message.createdAt);
      entries.add(message);
      previous = message.createdAt;
    }

    // The list is reversed so it starts at the newest message and new ones appear at the bottom.
    return ListView.builder(
      reverse: true,
      padding: const EdgeInsets.fromLTRB(12, 12, 12, 8),
      itemCount: entries.length,
      itemBuilder: (_, index) {
        final entry = entries[entries.length - 1 - index];
        if (entry is DateTime) return _DayHeading(time: entry);
        final message = entry as ChatMessage;
        return Padding(
          padding: const EdgeInsets.symmetric(vertical: 3),
          child: MessageBubble(
            key: ValueKey(message.key),
            message: message,
            onLongPress: () => _showActions(context, ref, message),
          ),
        );
      },
    );
  }

  void _showActions(BuildContext context, WidgetRef ref, ChatMessage message) {
    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      builder: (sheetContext) {
        final scheme = Theme.of(sheetContext).colorScheme;
        return SafeArea(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (message.text.isNotEmpty)
                ListTile(
                  leading: const Icon(Icons.copy_rounded),
                  title: const Text('Copy text'),
                  onTap: () {
                    Navigator.pop(sheetContext);
                    Clipboard.setData(ClipboardData(text: message.text));
                    ScaffoldMessenger.of(context)
                      ..hideCurrentSnackBar()
                      ..showSnackBar(const SnackBar(content: Text('Copied')));
                  },
                ),
              if (message.canEdit)
                ListTile(
                  leading: const Icon(Icons.edit_outlined),
                  title: const Text('Edit message'),
                  onTap: () {
                    Navigator.pop(sheetContext);
                    _editMessage(context, ref, message);
                  },
                ),
              if (message.id != null)
                ListTile(
                  leading: Icon(Icons.delete_outline_rounded, color: scheme.error),
                  title: Text('Delete message', style: TextStyle(color: scheme.error)),
                  onTap: () {
                    Navigator.pop(sheetContext);
                    _confirmDelete(context, ref, message);
                  },
                ),
            ],
          ),
        );
      },
    );
  }

  Future<void> _editMessage(BuildContext context, WidgetRef ref, ChatMessage message) async {
    final maxLength = ChatPlatform.fromPsid(psid).messageLimit;
    final newText = await showDialog<String>(
      context: context,
      builder: (_) => _EditMessageDialog(initialText: message.text, maxLength: maxLength),
    );
    if (newText == null) return;
    try {
      await ref.read(chatControllerProvider(psid).notifier).editMessage(message, newText);
    } catch (error) {
      if (context.mounted) showError(context, error);
    }
  }

  Future<void> _confirmDelete(BuildContext context, WidgetRef ref, ChatMessage message) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Delete message?'),
        content: const Text('It is removed from the dashboard (and its media is deleted). It is not unsent from the customer\'s chat.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(dialogContext, false), child: const Text('Cancel')),
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, true),
            style: TextButton.styleFrom(foregroundColor: Theme.of(dialogContext).colorScheme.error),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    try {
      await ref.read(chatControllerProvider(psid).notifier).deleteMessage(message);
    } catch (error) {
      if (context.mounted) showError(context, error);
    }
  }
}

/// Edit box for a message we sent. Returns the new text, or null when cancelled.
class _EditMessageDialog extends StatefulWidget {
  const _EditMessageDialog({required this.initialText, required this.maxLength});

  final String initialText;
  final int maxLength;

  @override
  State<_EditMessageDialog> createState() => _EditMessageDialogState();
}

class _EditMessageDialogState extends State<_EditMessageDialog> {
  late final TextEditingController _controller = TextEditingController(text: widget.initialText);

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return AlertDialog(
      title: const Text('Edit message'),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          TextField(
            controller: _controller,
            autofocus: true,
            minLines: 1,
            maxLines: 6,
            maxLength: widget.maxLength,
            textCapitalization: TextCapitalization.sentences,
          ),
          const SizedBox(height: 4),
          Text(
            'This only changes the copy in your dashboard. The customer still sees the original message, '
            'because WhatsApp, Facebook and Instagram do not allow editing a message that was already sent.',
            style: TextStyle(color: scheme.onSurfaceVariant, fontSize: 12),
          ),
        ],
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancel')),
        ValueListenableBuilder<TextEditingValue>(
          valueListenable: _controller,
          builder: (_, value, _) {
            final text = value.text.trim();
            final changed = text.isNotEmpty && text != widget.initialText.trim();
            return FilledButton(
              onPressed: changed ? () => Navigator.pop(context, text) : null,
              child: const Text('Save'),
            );
          },
        ),
      ],
    );
  }
}

class _DayHeading extends StatelessWidget {
  const _DayHeading({required this.time});

  final DateTime time;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 10),
      child: Center(
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
          decoration: BoxDecoration(
            color: scheme.surfaceContainerHighest,
            borderRadius: BorderRadius.circular(12),
          ),
          child: Text(
            formatDayHeading(time),
            style: TextStyle(color: scheme.onSurfaceVariant, fontSize: 12),
          ),
        ),
      ),
    );
  }
}
