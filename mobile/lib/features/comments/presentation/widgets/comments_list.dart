import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../inbox/domain/chat_platform.dart';
import '../../../inbox/presentation/widgets/common.dart';
import '../../application/comments_controller.dart';
import 'comment_card.dart';

/// The comments of one channel. Stays alive while the user switches tabs, so the live connection and
/// the list are not rebuilt every time.
class CommentsList extends ConsumerStatefulWidget {
  const CommentsList({super.key, required this.platform});

  final ChatPlatform platform;

  @override
  ConsumerState<CommentsList> createState() => _CommentsListState();
}

class _CommentsListState extends ConsumerState<CommentsList> with AutomaticKeepAliveClientMixin {
  @override
  bool get wantKeepAlive => true;

  @override
  Widget build(BuildContext context) {
    super.build(context);
    final platform = widget.platform;
    final comments = ref.watch(commentsControllerProvider(platform));
    final data = comments.value;

    final Widget body;
    if (data != null) {
      body = RefreshIndicator(
        onRefresh: () => ref.read(commentsControllerProvider(platform).notifier).refresh(),
        child: data.comments.isEmpty
            ? ListView(
                physics: const AlwaysScrollableScrollPhysics(),
                children: [
                  SizedBox(
                    height: 320,
                    child: EmptyView(
                      icon: Icons.forum_outlined,
                      title: 'No ${platform.label} comments yet',
                      subtitle: 'Comments on your posts will appear here as soon as they arrive.',
                    ),
                  ),
                ],
              )
            : ListView.builder(
                physics: const AlwaysScrollableScrollPhysics(),
                padding: const EdgeInsets.symmetric(vertical: 6),
                itemCount: data.comments.length,
                itemBuilder: (_, index) => CommentCard(
                  key: ValueKey(data.comments[index].commentId),
                  platform: platform,
                  comment: data.comments[index],
                ),
              ),
      );
    } else if (comments.hasError) {
      body = ErrorView(
        message: errorText(comments.error!),
        onRetry: () => ref.invalidate(commentsControllerProvider(platform)),
      );
    } else {
      body = const Center(child: CircularProgressIndicator());
    }

    return Column(
      children: [
        _CommentBotBar(
          platform: platform,
          active: data?.botActive ?? true,
          live: data?.live ?? false,
          count: data?.comments.length,
          enabled: data != null,
        ),
        Expanded(child: body),
      ],
    );
  }
}

class _CommentBotBar extends ConsumerWidget {
  const _CommentBotBar({
    required this.platform,
    required this.active,
    required this.live,
    required this.count,
    required this.enabled,
  });

  final ChatPlatform platform;
  final bool active;
  final bool live;
  final int? count;
  final bool enabled;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final scheme = Theme.of(context).colorScheme;
    final muted = TextStyle(color: scheme.onSurfaceVariant, fontSize: 12);
    return Container(
      padding: const EdgeInsets.fromLTRB(16, 4, 8, 4),
      decoration: BoxDecoration(
        color: scheme.surface,
        border: Border(bottom: BorderSide(color: scheme.outline)),
      ),
      child: Row(
        children: [
          Icon(
            active ? Icons.smart_toy_rounded : Icons.smart_toy_outlined,
            size: 20,
            color: active ? scheme.primary : scheme.onSurfaceVariant,
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  active
                      ? '${platform.label} comment bot is active'
                      : '${platform.label} comment bot is paused',
                  style: TextStyle(color: scheme.onSurface, fontSize: 13),
                ),
                Row(
                  children: [
                    Container(
                      width: 7,
                      height: 7,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: live ? scheme.primary : scheme.onSurfaceVariant,
                      ),
                    ),
                    const SizedBox(width: 6),
                    Text(
                      [
                        if (count != null) '$count ${count == 1 ? 'comment' : 'comments'}',
                        live ? 'Live' : 'Syncing',
                      ].join(' · '),
                      style: muted,
                    ),
                  ],
                ),
              ],
            ),
          ),
          Switch(
            value: active,
            onChanged: enabled
                ? (value) async {
                    try {
                      await ref
                          .read(commentsControllerProvider(platform).notifier)
                          .setBotActive(value);
                    } catch (error) {
                      if (context.mounted) showError(context, error);
                    }
                  }
                : null,
          ),
        ],
      ),
    );
  }
}
