import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../inbox/domain/chat_platform.dart';
import '../../../inbox/presentation/widgets/common.dart';
import '../../application/comments_controller.dart';
import '../../domain/comment.dart';

/// Bottom sheet to answer a comment, publicly under it or privately in the commenter's inbox.
Future<void> showReplySheet(
  BuildContext context, {
  required ChatPlatform platform,
  required Comment comment,
  bool startPrivate = false,
}) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    builder: (_) => _ReplySheet(platform: platform, comment: comment, startPrivate: startPrivate),
  );
}

class _ReplySheet extends ConsumerStatefulWidget {
  const _ReplySheet({required this.platform, required this.comment, required this.startPrivate});

  final ChatPlatform platform;
  final Comment comment;
  final bool startPrivate;

  @override
  ConsumerState<_ReplySheet> createState() => _ReplySheetState();
}

class _ReplySheetState extends ConsumerState<_ReplySheet> {
  final _text = TextEditingController();
  late bool _wantsPrivate = widget.startPrivate && !widget.comment.privateReplySent;
  bool _sending = false;

  @override
  void dispose() {
    _text.dispose();
    super.dispose();
  }

  /// The live copy of the comment knows if its private reply got used up while this sheet was open.
  bool _privateUsed(CommentsState? state) {
    final live = state?.comments.where((item) => item.commentId == widget.comment.commentId).firstOrNull;
    return live?.privateReplySent ?? widget.comment.privateReplySent;
  }

  Future<void> _send() async {
    final text = _text.text.trim();
    if (text.isEmpty || _sending) return;
    // What the button and hint currently say is exactly what gets sent.
    final isPrivate = _wantsPrivate && !_privateUsed(ref.read(commentsControllerProvider(widget.platform)).value);
    // Captured before the sheet closes, so the confirmation still has a place to appear.
    final messenger = ScaffoldMessenger.of(context);
    setState(() => _sending = true);
    try {
      final warning = await ref
          .read(commentsControllerProvider(widget.platform).notifier)
          .reply(widget.comment, text, isPrivate: isPrivate);
      if (!mounted) return;
      Navigator.pop(context);
      messenger
        ..hideCurrentSnackBar()
        ..showSnackBar(SnackBar(
          content: Text(warning ?? (isPrivate ? 'Private reply sent' : 'Reply posted')),
        ));
    } catch (error) {
      if (!mounted) return;
      setState(() => _sending = false);
      showError(context, error); // The text stays in the box so nothing typed is lost.
    }
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final comment = widget.comment;
    final privateUsed = _privateUsed(ref.watch(commentsControllerProvider(widget.platform)).value);
    final isPrivate = _wantsPrivate && !privateUsed;

    return Padding(
      padding: EdgeInsets.fromLTRB(16, 0, 16, 16 + MediaQuery.viewInsetsOf(context).bottom),
      child: SafeArea(
        top: false,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: scheme.surfaceContainerHighest,
                borderRadius: BorderRadius.circular(12),
              ),
              child: Text(
                comment.message.isEmpty ? '[No text]' : comment.message,
                maxLines: 4,
                overflow: TextOverflow.ellipsis,
              ),
            ),
            const SizedBox(height: 12),
            SegmentedButton<bool>(
              showSelectedIcon: false,
              segments: [
                const ButtonSegment(
                  value: false,
                  icon: Icon(Icons.comment_outlined),
                  label: Text('Public reply'),
                ),
                ButtonSegment(
                  value: true,
                  icon: const Icon(Icons.lock_outline_rounded),
                  label: const Text('Private reply'),
                  enabled: !privateUsed,
                ),
              ],
              selected: {isPrivate},
              onSelectionChanged: _sending ? null : (value) => setState(() => _wantsPrivate = value.first),
            ),
            const SizedBox(height: 8),
            Text(
              privateUsed
                  ? '${widget.platform.label} allows only one private reply per comment, and it has been used.'
                  : isPrivate
                      ? 'Sent to ${comment.titles.headline} as a message. One private reply per comment; '
                          'a short public note tells them to check their inbox.'
                      : 'Visible to everyone under the comment.',
              style: TextStyle(color: scheme.onSurfaceVariant, fontSize: 12),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _text,
              enabled: !_sending,
              autofocus: true,
              minLines: 2,
              maxLines: 5,
              maxLength: widget.platform.messageLimit,
              textCapitalization: TextCapitalization.sentences,
              decoration: InputDecoration(
                hintText: isPrivate ? 'Write a private message' : 'Write a public reply',
              ),
              onChanged: (_) => setState(() {}),
            ),
            const SizedBox(height: 8),
            FilledButton.icon(
              onPressed: _sending || _text.text.trim().isEmpty ? null : _send,
              icon: _sending
                  ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                  : const Icon(Icons.send_rounded),
              label: Text(isPrivate ? 'Send privately' : 'Post reply'),
            ),
          ],
        ),
      ),
    );
  }
}
