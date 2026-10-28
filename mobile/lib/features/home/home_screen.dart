import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/push_service.dart';
import '../comments/presentation/comments_page.dart';
import '../inbox/presentation/inbox_page.dart';
import '../notifications/application/notifications_controller.dart';
import '../notifications/domain/app_notification.dart';
import '../notifications/presentation/notification_actions.dart';
import '../notifications/presentation/notifications_page.dart';
import '../profile/presentation/profile_page.dart';
import 'home_tab.dart';

/// Signed-in landing screen: bottom navigation between Inbox, Comments, Alerts and Profile.
class HomeScreen extends ConsumerStatefulWidget {
  const HomeScreen({super.key});

  @override
  ConsumerState<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends ConsumerState<HomeScreen> {
  static const _titles = ['Inbox', 'Comments', 'Alerts', 'Profile'];

  StreamSubscription<PushTap>? _pushTaps;

  @override
  void initState() {
    super.initState();
    final push = ref.read(pushServiceProvider);
    // Listen first so a tap that launched the app is not missed, then register this phone for background alerts.
    _pushTaps = push.taps.listen(_openPush);
    unawaited(push.start());
  }

  @override
  void dispose() {
    unawaited(_pushTaps?.cancel());
    super.dispose();
  }

  /// A push notification was tapped: open the chat, or the Comments tab (same targets as the Alerts list).
  void _openPush(PushTap tap) {
    if (!mounted) return;
    if (tap.isComment) {
      context.go('/');
      ref.read(homeTabProvider.notifier).select(HomeTabs.comments);
      return;
    }
    final target = tap.targetId;
    if (target != null) context.push('/chat/${Uri.encodeComponent(target)}');
  }

  /// Announces a notification that arrived while the app is open (muting rules were already applied).
  void _showIncoming(AppNotification item) {
    if (!mounted || ref.read(homeTabProvider) == HomeTabs.alerts) return;
    final seconds = ref.read(notificationSettingsProvider).value?.popupSeconds ?? 7;
    final preview = item.preview.isEmpty ? 'New activity' : item.preview;
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(
        SnackBar(
          duration: Duration(seconds: seconds.clamp(3, 30)),
          content: Text('${item.displayName}: $preview', maxLines: 2, overflow: TextOverflow.ellipsis),
          action: SnackBarAction(
            label: 'Open',
            onPressed: () {
              if (mounted) openNotification(context, ref, item);
            },
          ),
        ),
      );
  }

  @override
  Widget build(BuildContext context) {
    final index = ref.watch(homeTabProvider);
    final unread = ref.watch(notificationsControllerProvider.select((state) => state.value?.unreadCount ?? 0));
    // Keeps the preferences loaded so muting rules apply to live notifications.
    ref.watch(notificationSettingsProvider);

    ref.listen<AppNotification?>(
      notificationsControllerProvider.select((state) => state.value?.incoming),
      (previous, next) {
        if (next != null && !identical(previous, next)) _showIncoming(next);
      },
    );

    final inboxUnread = ref.watch(totalUnreadMessagesProvider);

    Widget inboxIcon(IconData icon) {
      return Badge(
        isLabelVisible: inboxUnread > 0,
        label: Text(inboxUnread > 99 ? '99+' : '$inboxUnread'),
        child: Icon(icon),
      );
    }

    Widget alertsIcon(IconData icon) {
      return Badge(
        isLabelVisible: unread > 0,
        label: Text(unread > 99 ? '99+' : '$unread'),
        child: Icon(icon),
      );
    }

    return Scaffold(
      appBar: AppBar(title: Text('Synthra · ${_titles[index]}')),
      // All sections stay mounted so their live connections and scroll positions survive tab switches.
      body: IndexedStack(
        index: index,
        children: const [InboxPage(), CommentsPage(), NotificationsPage(), ProfilePage()],
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: index,
        onDestinationSelected: (value) => ref.read(homeTabProvider.notifier).select(value),
        destinations: [
          NavigationDestination(
            icon: inboxIcon(Icons.chat_bubble_outline_rounded),
            selectedIcon: inboxIcon(Icons.chat_bubble_rounded),
            label: 'Inbox',
          ),
          const NavigationDestination(
            icon: Icon(Icons.forum_outlined),
            selectedIcon: Icon(Icons.forum_rounded),
            label: 'Comments',
          ),
          NavigationDestination(
            icon: alertsIcon(Icons.notifications_none_rounded),
            selectedIcon: alertsIcon(Icons.notifications_rounded),
            label: 'Alerts',
          ),
          const NavigationDestination(
            icon: Icon(Icons.person_outline_rounded),
            selectedIcon: Icon(Icons.person_rounded),
            label: 'Profile',
          ),
        ],
      ),
    );
  }
}
