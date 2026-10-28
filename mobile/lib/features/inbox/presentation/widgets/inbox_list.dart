import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../application/inbox_controller.dart';
import '../../domain/chat_platform.dart';
import '../../domain/conversation.dart';
import '../../domain/global_bot_settings.dart';
import 'common.dart';
import 'conversation_tile.dart';

/// The conversation list of one channel. Stays alive while the user switches tabs, so the live
/// connection and the list are not rebuilt every time.
class InboxList extends ConsumerStatefulWidget {
  const InboxList({super.key, required this.platform});

  final ChatPlatform platform;

  @override
  ConsumerState<InboxList> createState() => _InboxListState();
}

class _InboxListState extends ConsumerState<InboxList> with AutomaticKeepAliveClientMixin {
  final _searchController = TextEditingController();
  String _query = '';

  @override
  bool get wantKeepAlive => true;

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  /// True when [conversation] matches every word typed in the search box
  /// (name, custom name, username / phone number, id, or last message).
  bool _matches(Conversation conversation, List<String> words) {
    final titles = conversation.titles;
    final haystack = [
      titles.headline,
      titles.subHeadline,
      conversation.customName ?? '',
      conversation.name,
      conversation.username,
      conversation.psid,
      conversation.lastMessageText ?? '',
    ].join(' ').toLowerCase();
    return words.every(haystack.contains);
  }

  @override
  Widget build(BuildContext context) {
    super.build(context);
    final platform = widget.platform;
    final inbox = ref.watch(inboxControllerProvider(platform));
    final global = ref.watch(globalBotProvider).value ?? const GlobalBotSettings.allOn();
    final globalActive = global.isActive(platform);

    final allRows = inbox.value;
    final words = _query.toLowerCase().split(RegExp(r'\s+')).where((word) => word.isNotEmpty).toList();
    final searching = words.isNotEmpty;
    final rows = allRows == null || !searching
        ? allRows
        : allRows.where((conversation) => _matches(conversation, words)).toList();

    final Widget body;
    if (rows != null) {
      body = RefreshIndicator(
        onRefresh: () => ref.read(inboxControllerProvider(platform).notifier).refresh(),
        child: rows.isEmpty
            ? ListView(
                physics: const AlwaysScrollableScrollPhysics(),
                keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
                children: [
                  SizedBox(
                    height: 320,
                    child: searching
                        ? EmptyView(
                            icon: Icons.search_off_rounded,
                            title: 'No results for "$_query"',
                            subtitle: 'Try a name, a phone number, or a word from the last message.',
                          )
                        : EmptyView(
                            icon: Icons.chat_bubble_outline_rounded,
                            title: 'No ${platform.label} conversations yet',
                            subtitle: 'New messages will appear here as soon as customers write in.',
                          ),
                  ),
                ],
              )
            : ListView.separated(
                physics: const AlwaysScrollableScrollPhysics(),
                keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
                itemCount: rows.length,
                separatorBuilder: (_, _) => const Divider(height: 1, indent: 78),
                itemBuilder: (_, index) => ConversationTile(
                  key: ValueKey(rows[index].psid),
                  conversation: rows[index],
                  globalBotActive: globalActive,
                ),
              ),
      );
    } else if (inbox.hasError) {
      body = ErrorView(
        message: errorText(inbox.error!),
        onRetry: () => ref.invalidate(inboxControllerProvider(platform)),
      );
    } else {
      body = const Center(child: CircularProgressIndicator());
    }

    return Column(
      children: [
        _GlobalBotBar(platform: platform, active: globalActive),
        if (allRows != null && allRows.isNotEmpty)
          _SearchBar(
            controller: _searchController,
            hint: 'Search ${platform.label} conversations',
            onChanged: (value) => setState(() => _query = value.trim()),
            onClear: () {
              _searchController.clear();
              setState(() => _query = '');
            },
          ),
        if (rows != null && allRows != null && allRows.isNotEmpty)
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 4, 16, 4),
            child: Align(
              alignment: Alignment.centerLeft,
              child: Text(
                searching
                    ? '${rows.length} of ${allRows.length} conversations'
                    : _summary(allRows.length, allRows.where((item) => item.unreadCount > 0).length),
                style: TextStyle(color: Theme.of(context).colorScheme.onSurfaceVariant, fontSize: 12),
              ),
            ),
          ),
        Expanded(child: body),
      ],
    );
  }
}

String _summary(int total, int unread) {
  final conversations = total == 1 ? '1 conversation' : '$total conversations';
  return unread == 0 ? conversations : '$conversations · $unread unread';
}

class _SearchBar extends StatelessWidget {
  const _SearchBar({
    required this.controller,
    required this.hint,
    required this.onChanged,
    required this.onClear,
  });

  final TextEditingController controller;
  final String hint;
  final ValueChanged<String> onChanged;
  final VoidCallback onClear;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 8, 12, 0),
      child: TextField(
        controller: controller,
        onChanged: onChanged,
        textInputAction: TextInputAction.search,
        decoration: InputDecoration(
          hintText: hint,
          isDense: true,
          prefixIcon: const Icon(Icons.search_rounded),
          suffixIcon: ValueListenableBuilder<TextEditingValue>(
            valueListenable: controller,
            builder: (_, value, _) => value.text.isEmpty
                ? const SizedBox.shrink()
                : IconButton(
                    tooltip: 'Clear',
                    icon: const Icon(Icons.close_rounded),
                    onPressed: onClear,
                  ),
          ),
          border: OutlineInputBorder(borderRadius: BorderRadius.circular(24)),
        ),
      ),
    );
  }
}

class _GlobalBotBar extends ConsumerWidget {
  const _GlobalBotBar({required this.platform, required this.active});

  final ChatPlatform platform;
  final bool active;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final scheme = Theme.of(context).colorScheme;
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
            child: Text(
              active
                  ? '${platform.label} bot is replying automatically'
                  : '${platform.label} bot is paused for all conversations',
              style: TextStyle(color: scheme.onSurfaceVariant, fontSize: 13),
            ),
          ),
          Switch(
            value: active,
            onChanged: (value) async {
              try {
                await ref.read(globalBotProvider.notifier).setActive(platform, value);
              } catch (error) {
                if (context.mounted) showError(context, error);
              }
            },
          ),
        ],
      ),
    );
  }
}
