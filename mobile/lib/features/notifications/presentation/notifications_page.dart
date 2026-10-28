import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../inbox/domain/chat_platform.dart';
import '../../inbox/presentation/widgets/common.dart';
import '../application/notifications_controller.dart';
import '../domain/app_notification.dart';
import 'notification_actions.dart';
import 'widgets/notification_settings_sheet.dart';
import 'widgets/notification_tile.dart';

const _groupOrder = ['Today', 'Yesterday', 'Earlier'];

String _groupOf(DateTime? time) {
  if (time == null) return 'Earlier';
  final now = DateTime.now();
  final today = DateTime(now.year, now.month, now.day);
  final day = DateTime(time.year, time.month, time.day);
  final daysAgo = today.difference(day).inDays;
  if (daysAgo <= 0) return 'Today';
  if (daysAgo == 1) return 'Yesterday';
  return 'Earlier';
}

/// Notification center: new messages, comments and human-handover requests across all channels.
class NotificationsPage extends ConsumerWidget {
  const NotificationsPage({super.key});

  Future<void> _run(BuildContext context, Future<void> Function() action) async {
    try {
      await action();
    } catch (error) {
      if (context.mounted) showError(context, error);
    }
  }

  Future<void> _confirmClear(BuildContext context, WidgetRef ref) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Clear all notifications?'),
        content: const Text('Every notification is deleted from the dashboard. This cannot be undone.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(dialogContext, false), child: const Text('Cancel')),
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, true),
            style: TextButton.styleFrom(foregroundColor: Theme.of(dialogContext).colorScheme.error),
            child: const Text('Clear'),
          ),
        ],
      ),
    );
    if (confirmed != true || !context.mounted) return;
    await _run(context, () => ref.read(notificationsControllerProvider.notifier).clearAll());
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final notifications = ref.watch(notificationsControllerProvider);
    final filter = ref.watch(notificationFilterProvider);
    final controller = ref.read(notificationsControllerProvider.notifier);
    final data = notifications.value;
    final visible = data == null ? const <AppNotification>[] : filter.apply(data.items);

    final Widget body;
    if (data != null) {
      body = RefreshIndicator(
        onRefresh: controller.refresh,
        child: visible.isEmpty
            ? ListView(
                physics: const AlwaysScrollableScrollPhysics(),
                children: [
                  SizedBox(
                    height: 320,
                    child: EmptyView(
                      icon: Icons.notifications_none_rounded,
                      title: data.items.isEmpty ? "You're all caught up" : 'Nothing matches these filters',
                      subtitle: data.items.isEmpty
                          ? 'New messages, comments and human requests will show up here.'
                          : 'Try another channel or type.',
                    ),
                  ),
                ],
              )
            : ListView(
                physics: const AlwaysScrollableScrollPhysics(),
                children: [
                  for (final group in _groupOrder)
                    ..._section(context, ref, group, [
                      for (final item in visible)
                        if (_groupOf(item.createdAt) == group) item,
                    ]),
                ],
              ),
      );
    } else if (notifications.hasError) {
      body = ErrorView(
        message: errorText(notifications.error!),
        onRetry: () => ref.invalidate(notificationsControllerProvider),
      );
    } else {
      body = const Center(child: CircularProgressIndicator());
    }

    final unread = data?.unreadCount ?? 0;
    return Column(
      children: [
        const _FilterBar(),
        Container(
          padding: const EdgeInsets.fromLTRB(16, 0, 8, 0),
          child: Row(
            children: [
              Expanded(
                child: Text(
                  unread > 0 ? '$unread unread' : 'All read',
                  style: TextStyle(color: Theme.of(context).colorScheme.onSurfaceVariant, fontSize: 13),
                ),
              ),
              if (unread > 0)
                TextButton(
                  onPressed: () => _run(
                    context,
                    () => controller.markAllRead(platform: filter.platform),
                  ),
                  child: const Text('Mark all read'),
                ),
              if (data != null && data.items.isNotEmpty)
                TextButton(onPressed: () => _confirmClear(context, ref), child: const Text('Clear')),
              IconButton(
                tooltip: 'Notification settings',
                onPressed: () => showNotificationSettingsSheet(context),
                icon: const Icon(Icons.tune_rounded),
              ),
            ],
          ),
        ),
        const Divider(height: 1),
        Expanded(child: body),
      ],
    );
  }

  List<Widget> _section(BuildContext context, WidgetRef ref, String label, List<AppNotification> items) {
    if (items.isEmpty) return const [];
    final controller = ref.read(notificationsControllerProvider.notifier);
    final scheme = Theme.of(context).colorScheme;
    return [
      Padding(
        padding: const EdgeInsets.fromLTRB(16, 14, 16, 6),
        child: Text(
          label.toUpperCase(),
          style: TextStyle(
            color: scheme.onSurfaceVariant,
            fontSize: 11,
            fontWeight: FontWeight.w700,
            letterSpacing: 0.8,
          ),
        ),
      ),
      for (final item in items)
        NotificationTile(
          key: ValueKey(item.key),
          item: item,
          onTap: () => openNotification(context, ref, item),
          onDelete: () => _run(context, () => controller.delete(item)),
        ),
    ];
  }
}

class _FilterBar extends ConsumerWidget {
  const _FilterBar();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final filter = ref.watch(notificationFilterProvider);
    final controller = ref.read(notificationFilterProvider.notifier);

    return Padding(
      padding: const EdgeInsets.only(top: 8, bottom: 4),
      child: Column(
        children: [
          _ChipRow(
            children: [
              ChoiceChip(
                label: const Text('All'),
                selected: filter.platform == null,
                onSelected: (_) => controller.setPlatform(null),
              ),
              for (final platform in ChatPlatform.values)
                ChoiceChip(
                  label: Text(platform.label),
                  selected: filter.platform == platform,
                  onSelected: (_) => controller.setPlatform(filter.platform == platform ? null : platform),
                ),
            ],
          ),
          _ChipRow(
            children: [
              ChoiceChip(
                label: const Text('All types'),
                selected: filter.type == null,
                onSelected: (_) => controller.setType(null),
              ),
              for (final type in notificationTypes)
                ChoiceChip(
                  label: Text(notificationTypeLabel(type)),
                  selected: filter.type == type,
                  onSelected: (_) => controller.setType(filter.type == type ? null : type),
                ),
              FilterChip(
                label: const Text('Unread only'),
                selected: filter.unreadOnly,
                onSelected: (_) => controller.toggleUnreadOnly(),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _ChipRow extends StatelessWidget {
  const _ChipRow({required this.children});

  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      padding: const EdgeInsets.symmetric(horizontal: 12),
      child: Row(
        children: [
          for (final child in children) Padding(padding: const EdgeInsets.only(right: 8), child: child),
        ],
      ),
    );
  }
}
