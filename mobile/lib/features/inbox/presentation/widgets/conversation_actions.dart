import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../application/inbox_controller.dart';
import '../../domain/conversation.dart';
import 'common.dart';

/// Asks for a new display name and saves it. An empty name removes the custom name.
/// The name is only stored in the dashboard; it is never sent to the customer.
Future<void> renameConversationFlow(BuildContext context, WidgetRef ref, Conversation conversation) async {
  final name = await showDialog<String>(
    context: context,
    builder: (_) => _RenameDialog(initial: conversation.customName ?? conversation.titles.headline),
  );
  if (name == null || !context.mounted) return;
  try {
    await ref.read(inboxControllerProvider(conversation.platform).notifier).rename(conversation, name);
  } catch (error) {
    if (context.mounted) showError(context, error);
  }
}

/// Confirms and permanently deletes the conversation. Returns true if it was deleted.
Future<bool> deleteConversationFlow(BuildContext context, WidgetRef ref, Conversation conversation) async {
  final confirmed = await showDialog<bool>(
    context: context,
    builder: (dialogContext) => AlertDialog(
      title: const Text('Delete conversation?'),
      content: Text(
        'This permanently deletes all messages and media of "${conversation.titles.headline}" '
        'from the dashboard. It does not remove anything from ${conversation.platform.label}.',
      ),
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
  if (confirmed != true || !context.mounted) return false;
  try {
    await ref.read(inboxControllerProvider(conversation.platform).notifier).delete(conversation);
    return true;
  } catch (error) {
    if (context.mounted) showError(context, error);
    return false;
  }
}

Future<void> toggleConversationBot(
  BuildContext context,
  WidgetRef ref,
  Conversation conversation,
  bool active,
) async {
  try {
    await ref
        .read(inboxControllerProvider(conversation.platform).notifier)
        .setBotActive(conversation, active);
  } catch (error) {
    if (context.mounted) showError(context, error);
  }
}

class _RenameDialog extends StatefulWidget {
  const _RenameDialog({required this.initial});

  final String initial;

  @override
  State<_RenameDialog> createState() => _RenameDialogState();
}

class _RenameDialogState extends State<_RenameDialog> {
  late final TextEditingController _controller = TextEditingController(text: widget.initial);

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('Edit display name'),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('Only you see this name. Leave it empty to use the contact\'s own name.'),
          const SizedBox(height: 12),
          TextField(
            controller: _controller,
            autofocus: true,
            maxLength: 80,
            textInputAction: TextInputAction.done,
            decoration: const InputDecoration(hintText: 'Custom name'),
            onSubmitted: (value) => Navigator.pop(context, value.trim()),
          ),
        ],
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancel')),
        FilledButton(
          onPressed: () => Navigator.pop(context, _controller.text.trim()),
          style: FilledButton.styleFrom(minimumSize: const Size(88, 44)),
          child: const Text('Save'),
        ),
      ],
    );
  }
}
