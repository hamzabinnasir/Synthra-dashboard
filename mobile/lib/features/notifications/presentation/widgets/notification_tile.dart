import 'package:flutter/material.dart';

import '../../../inbox/domain/chat_platform.dart';
import '../../../inbox/presentation/formatters.dart';
import '../../../inbox/presentation/widgets/common.dart';
import '../../domain/app_notification.dart';

/// Brand color of each channel, as on the web dashboard.
Color platformColor(ChatPlatform platform) {
  switch (platform) {
    case ChatPlatform.whatsapp:
      return const Color(0xFF25D366);
    case ChatPlatform.facebook:
      return const Color(0xFF1877F2);
    case ChatPlatform.instagram:
      return const Color(0xFFE1306C);
  }
}

String _platformInitial(ChatPlatform platform) {
  switch (platform) {
    case ChatPlatform.whatsapp:
      return 'W';
    case ChatPlatform.facebook:
      return 'f';
    case ChatPlatform.instagram:
      return 'IG';
  }
}

IconData _kindIcon(NotificationKind kind) {
  switch (kind) {
    case NotificationKind.urgent:
      return Icons.priority_high_rounded;
    case NotificationKind.media:
      return Icons.attach_file_rounded;
    case NotificationKind.comment:
      return Icons.forum_outlined;
    case NotificationKind.message:
      return Icons.mail_outline_rounded;
  }
}

String _kindLabel(NotificationKind kind) {
  switch (kind) {
    case NotificationKind.urgent:
      return 'Human requested';
    case NotificationKind.media:
      return 'Media';
    case NotificationKind.comment:
      return 'Comment';
    case NotificationKind.message:
      return 'Message';
  }
}

/// One row of the notification list. Swipe left to delete.
class NotificationTile extends StatelessWidget {
  const NotificationTile({
    super.key,
    required this.item,
    required this.onTap,
    required this.onDelete,
  });

  final AppNotification item;
  final VoidCallback onTap;
  final VoidCallback onDelete;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final brand = platformColor(item.platform);
    final urgent = item.kind == NotificationKind.urgent;
    final handle = item.handle;

    return Dismissible(
      key: ValueKey('notification-${item.key}'),
      direction: DismissDirection.endToStart,
      onDismissed: (_) => onDelete(),
      background: Container(
        color: scheme.error.withValues(alpha: 0.16),
        alignment: Alignment.centerRight,
        padding: const EdgeInsets.only(right: 24),
        child: Icon(Icons.delete_outline_rounded, color: scheme.error),
      ),
      child: InkWell(
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
          decoration: BoxDecoration(
            color: item.isRead ? null : scheme.primary.withValues(alpha: 0.06),
            border: Border(bottom: BorderSide(color: scheme.outline.withValues(alpha: 0.6))),
          ),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Stack(
                clipBehavior: Clip.none,
                children: [
                  ContactAvatar(initials: item.initials, size: 44),
                  Positioned(
                    right: -4,
                    bottom: -4,
                    child: Container(
                      constraints: const BoxConstraints(minWidth: 18),
                      height: 18,
                      alignment: Alignment.center,
                      padding: const EdgeInsets.symmetric(horizontal: 3),
                      decoration: BoxDecoration(
                        color: brand,
                        shape: BoxShape.rectangle,
                        borderRadius: BorderRadius.circular(9),
                        border: Border.all(color: scheme.surface, width: 1.5),
                      ),
                      child: Text(
                        _platformInitial(item.platform),
                        style: const TextStyle(color: Colors.white, fontSize: 9, fontWeight: FontWeight.w800),
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            item.displayName,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(
                              fontWeight: item.isRead ? FontWeight.w600 : FontWeight.w800,
                              fontSize: 15,
                            ),
                          ),
                        ),
                        const SizedBox(width: 8),
                        Text(
                          formatListTime(item.createdAt),
                          style: TextStyle(color: scheme.onSurfaceVariant, fontSize: 12),
                        ),
                      ],
                    ),
                    const SizedBox(height: 4),
                    Wrap(
                      spacing: 6,
                      runSpacing: 4,
                      crossAxisAlignment: WrapCrossAlignment.center,
                      children: [
                        _Chip(label: item.platform.label, color: brand),
                        _Chip(
                          label: _kindLabel(item.kind),
                          icon: _kindIcon(item.kind),
                          color: urgent ? scheme.error : scheme.onSurfaceVariant,
                        ),
                        if (handle != null)
                          Text(handle, style: TextStyle(color: scheme.onSurfaceVariant, fontSize: 11)),
                      ],
                    ),
                    if (item.preview.isNotEmpty) ...[
                      const SizedBox(height: 6),
                      Text(
                        item.preview,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(color: scheme.onSurface.withValues(alpha: 0.85), fontSize: 13),
                      ),
                    ],
                  ],
                ),
              ),
              if (!item.isRead)
                Padding(
                  padding: const EdgeInsets.only(left: 10, top: 6),
                  child: Container(
                    width: 9,
                    height: 9,
                    decoration: BoxDecoration(color: scheme.primary, shape: BoxShape.circle),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Chip extends StatelessWidget {
  const _Chip({required this.label, required this.color, this.icon});

  final String label;
  final Color color;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.14),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null) ...[
            Icon(icon, size: 12, color: color),
            const SizedBox(width: 3),
          ],
          Text(label, style: TextStyle(color: color, fontSize: 11, fontWeight: FontWeight.w600)),
        ],
      ),
    );
  }
}
