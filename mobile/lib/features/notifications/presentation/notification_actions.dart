import 'dart:async';

import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../home/home_tab.dart';
import '../application/notifications_controller.dart';
import '../domain/app_notification.dart';

/// Opens what a notification is about (the chat, or the Comments tab) and marks it read.
void openNotification(BuildContext context, WidgetRef ref, AppNotification item) {
  unawaited(_markReadQuietly(ref, item));
  if (item.isComment) {
    // Back to the home screen (in case a chat is open), then to the Comments tab.
    context.go('/');
    ref.read(homeTabProvider.notifier).select(HomeTabs.comments);
    return;
  }
  final target = item.targetId;
  if (target == null) return;
  context.push('/chat/${Uri.encodeComponent(target)}');
}

Future<void> _markReadQuietly(WidgetRef ref, AppNotification item) async {
  try {
    await ref.read(notificationsControllerProvider.notifier).markRead(item);
  } on Object {
    // Opening the notification still works; the next refresh shows the real read state.
  }
}
