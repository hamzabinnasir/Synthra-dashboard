import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../application/inbox_controller.dart';
import '../domain/chat_platform.dart';
import 'widgets/inbox_list.dart';

/// Totals for one channel's tab: how many conversations, and how many have unread messages.
class InboxCounts {
  const InboxCounts({required this.total, required this.unreadChats, required this.unreadMessages});

  final int total;
  final int unreadChats;
  final int unreadMessages;

  static const empty = InboxCounts(total: 0, unreadChats: 0, unreadMessages: 0);
}

/// Counts derived from the already-loaded conversation list, so they update live with it.
final inboxCountsProvider = Provider.autoDispose.family<InboxCounts, ChatPlatform>((ref, platform) {
  final rows = ref.watch(inboxControllerProvider(platform)).value;
  if (rows == null) return InboxCounts.empty;
  var unreadChats = 0;
  var unreadMessages = 0;
  for (final row in rows) {
    if (row.unreadCount > 0) {
      unreadChats += 1;
      unreadMessages += row.unreadCount;
    }
  }
  return InboxCounts(total: rows.length, unreadChats: unreadChats, unreadMessages: unreadMessages);
});

/// Unread messages across all channels (for the Inbox badge in the bottom navigation).
final totalUnreadMessagesProvider = Provider.autoDispose<int>((ref) {
  var sum = 0;
  for (final platform in ChatPlatform.values) {
    sum += ref.watch(inboxCountsProvider(platform)).unreadMessages;
  }
  return sum;
});

/// The server returns at most this many conversations per channel, so a total at the cap is shown as "100+".
const inboxListCap = 100;

String formatTotal(int total) => total >= inboxListCap ? '$inboxListCap+' : '$total';

/// Conversations: one tab per channel (WhatsApp, Facebook, Instagram), each showing its conversation count.
class InboxPage extends ConsumerWidget {
  const InboxPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final scheme = Theme.of(context).colorScheme;
    return DefaultTabController(
      length: ChatPlatform.values.length,
      child: Column(
        children: [
          Material(
            color: scheme.surface,
            child: TabBar(
              tabs: [
                for (final platform in ChatPlatform.values) _ChannelTab(platform: platform),
              ],
            ),
          ),
          Expanded(
            child: TabBarView(
              children: [for (final platform in ChatPlatform.values) InboxList(platform: platform)],
            ),
          ),
        ],
      ),
    );
  }
}

class _ChannelTab extends ConsumerWidget {
  const _ChannelTab({required this.platform});

  final ChatPlatform platform;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final counts = ref.watch(inboxCountsProvider(platform));
    final scheme = Theme.of(context).colorScheme;
    return Tab(
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(platform.label),
          if (counts.total > 0) ...[
            const SizedBox(width: 6),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 1),
              decoration: BoxDecoration(
                color: scheme.surfaceContainerHighest,
                borderRadius: BorderRadius.circular(10),
              ),
              child: Text(
                formatTotal(counts.total),
                style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: scheme.onSurface),
              ),
            ),
          ],
          if (counts.unreadChats > 0) ...[
            const SizedBox(width: 4),
            Container(
              width: 8,
              height: 8,
              decoration: BoxDecoration(color: scheme.primary, shape: BoxShape.circle),
            ),
          ],
        ],
      ),
    );
  }
}
