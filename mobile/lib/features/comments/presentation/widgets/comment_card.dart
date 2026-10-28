import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../inbox/domain/chat_platform.dart';
import '../../../inbox/presentation/formatters.dart';
import '../../../inbox/presentation/widgets/common.dart';
import '../../application/comments_controller.dart';
import '../../domain/comment.dart';
import 'reply_sheet.dart';

enum _Tone { neutral, good, bad }

_Tone _classificationTone(String? value) {
  final text = (value ?? '').toLowerCase();
  if (RegExp(r'neg|spam|hate|abus|complain|toxic|offens|insult').hasMatch(text)) return _Tone.bad;
  if (RegExp(r'pos|praise|compliment|thank|happy').hasMatch(text)) return _Tone.good;
  return _Tone.neutral;
}

_Tone _actionTone(String? action) {
  final text = (action ?? '').toLowerCase();
  if (text.contains('fail') || text.contains('error') || text.startsWith('deleted')) return _Tone.bad;
  if (text.contains('sent') || text.contains('replied')) return _Tone.good;
  return _Tone.neutral;
}

/// One comment with its status, the replies already sent, and the moderation actions.
class CommentCard extends ConsumerStatefulWidget {
  const CommentCard({super.key, required this.platform, required this.comment});

  final ChatPlatform platform;
  final Comment comment;

  @override
  ConsumerState<CommentCard> createState() => _CommentCardState();
}

class _CommentCardState extends ConsumerState<CommentCard> {
  static const _collapsedReplies = 2;

  bool _showAllReplies = false;
  bool _deleting = false;

  Future<void> _confirmDelete() async {
    final channel = widget.platform.label;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Delete comment?'),
        content: Text(
          'It is deleted from $channel (when it still exists there) and removed from the dashboard. '
          'This cannot be undone.',
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
    if (confirmed != true || !mounted) return;
    setState(() => _deleting = true);
    try {
      await ref.read(commentsControllerProvider(widget.platform).notifier).delete(widget.comment);
    } catch (error) {
      if (!mounted) return;
      setState(() => _deleting = false);
      showError(context, error);
    }
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final comment = widget.comment;
    final titles = comment.titles;
    final replies = comment.replies;
    final hiddenReplies = replies.length - _collapsedReplies;
    final visibleReplies = (_showAllReplies || hiddenReplies <= 0)
        ? replies
        : replies.sublist(replies.length - _collapsedReplies);
    final fromId = comment.fromId;

    return Card(
      margin: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                ContactAvatar(initials: titles.initials, imageUrl: comment.authorPicUrl, size: 42),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        titles.headline,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15),
                      ),
                      if (titles.subHeadline.isNotEmpty && titles.subHeadline != titles.headline)
                        Text(
                          titles.subHeadline,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(color: scheme.primary, fontSize: 12),
                        ),
                    ],
                  ),
                ),
                const SizedBox(width: 8),
                Text(
                  formatListTime(comment.createdAt),
                  style: TextStyle(color: scheme.onSurfaceVariant, fontSize: 12),
                ),
              ],
            ),
            const SizedBox(height: 10),
            Wrap(
              spacing: 6,
              runSpacing: 6,
              children: [
                _StatusChip(
                  label: humanize(comment.classification).isEmpty
                      ? 'Unclassified'
                      : humanize(comment.classification),
                  tone: _classificationTone(comment.classification),
                ),
                _StatusChip(
                  label: humanize(comment.action).isEmpty ? 'Pending' : humanize(comment.action),
                  tone: _actionTone(comment.action),
                ),
                if (comment.privateReplySent) const _StatusChip(label: 'Private reply sent', tone: _Tone.good),
              ],
            ),
            const SizedBox(height: 10),
            SelectableText(comment.message.isEmpty ? '[No text]' : comment.message),
            if (replies.isNotEmpty) ...[
              const SizedBox(height: 12),
              for (final reply in visibleReplies) _ReplyTile(reply: reply),
              if (hiddenReplies > 0)
                TextButton(
                  onPressed: () => setState(() => _showAllReplies = !_showAllReplies),
                  child: Text(_showAllReplies ? 'Show fewer replies' : 'Show $hiddenReplies earlier replies'),
                ),
            ],
            const SizedBox(height: 8),
            Row(
              children: [
                FilledButton.tonalIcon(
                  onPressed: _deleting
                      ? null
                      : () => showReplySheet(context, platform: widget.platform, comment: comment),
                  icon: const Icon(Icons.reply_rounded, size: 18),
                  label: const Text('Reply'),
                ),
                const SizedBox(width: 8),
                if (!comment.privateReplySent)
                  OutlinedButton.icon(
                    onPressed: _deleting
                        ? null
                        : () => showReplySheet(
                              context,
                              platform: widget.platform,
                              comment: comment,
                              startPrivate: true,
                            ),
                    icon: const Icon(Icons.lock_outline_rounded, size: 18),
                    label: const Text('Private'),
                  ),
                const Spacer(),
                if (fromId != null)
                  IconButton(
                    tooltip: 'Open conversation',
                    onPressed: () => context.push('/chat/${Uri.encodeComponent(fromId)}'),
                    icon: const Icon(Icons.chat_bubble_outline_rounded),
                  ),
                IconButton(
                  tooltip: 'Delete comment',
                  onPressed: _deleting ? null : _confirmDelete,
                  icon: _deleting
                      ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                      : Icon(Icons.delete_outline_rounded, color: scheme.error),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _StatusChip extends StatelessWidget {
  const _StatusChip({required this.label, required this.tone});

  final String label;
  final _Tone tone;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final color = switch (tone) {
      _Tone.good => scheme.primary,
      _Tone.bad => scheme.error,
      _Tone.neutral => scheme.onSurfaceVariant,
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.14),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Text(label, style: TextStyle(color: color, fontSize: 11, fontWeight: FontWeight.w600)),
    );
  }
}

class _ReplyTile extends StatelessWidget {
  const _ReplyTile({required this.reply});

  final CommentReply reply;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final who = reply.byBot ? 'Bot' : 'You';
    final kind = reply.isPrivate ? 'private' : 'public';
    return Container(
      width: double.infinity,
      margin: const EdgeInsets.only(bottom: 6),
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: scheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(10),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(
                reply.isPrivate ? Icons.lock_outline_rounded : Icons.reply_rounded,
                size: 14,
                color: scheme.onSurfaceVariant,
              ),
              const SizedBox(width: 6),
              Expanded(
                child: Text(
                  '$who · $kind reply',
                  style: TextStyle(color: scheme.onSurfaceVariant, fontSize: 11, fontWeight: FontWeight.w600),
                ),
              ),
              if (reply.createdAt != null)
                Text(
                  formatListTime(reply.createdAt),
                  style: TextStyle(color: scheme.onSurfaceVariant, fontSize: 11),
                ),
            ],
          ),
          const SizedBox(height: 4),
          Text(reply.text),
        ],
      ),
    );
  }
}
