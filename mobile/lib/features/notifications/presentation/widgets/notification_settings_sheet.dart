import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../inbox/domain/chat_platform.dart';
import '../../../inbox/presentation/widgets/common.dart';
import '../../application/notifications_controller.dart';
import '../../domain/app_notification.dart';
import '../../domain/notification_settings.dart';

/// Bottom sheet with the notification preferences (shared with the web dashboard).
Future<void> showNotificationSettingsSheet(BuildContext context) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    builder: (_) => const _SettingsSheet(),
  );
}

class _SettingsSheet extends ConsumerWidget {
  const _SettingsSheet();

  Future<void> _save(BuildContext context, WidgetRef ref, NotificationSettings next) async {
    try {
      await ref.read(notificationSettingsProvider.notifier).save(next);
    } catch (error) {
      if (context.mounted) showError(context, error);
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final settingsAsync = ref.watch(notificationSettingsProvider);
    final settings = settingsAsync.value;

    final Widget content;
    if (settings != null) {
      content = Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SwitchListTile(
            title: const Text('Do not disturb'),
            subtitle: const Text('No in-app alerts while this is on'),
            value: settings.dndEnabled,
            onChanged: (value) => _save(context, ref, settings.withDnd(value)),
          ),
          SwitchListTile(
            title: const Text('Sound'),
            subtitle: const Text('Play a sound when something new arrives while the app is open'),
            value: settings.soundEnabled,
            onChanged: (value) => _save(context, ref, settings.withSound(value)),
          ),
          SwitchListTile(
            title: const Text('Pop-up alerts'),
            subtitle: const Text('Show a banner when something new arrives while the app is open'),
            value: settings.popupEnabled,
            onChanged: (value) => _save(context, ref, settings.withPopup(value)),
          ),
          const _SectionLabel('Mute channels'),
          for (final platform in ChatPlatform.values)
            SwitchListTile(
              title: Text(platform.label),
              value: settings.isPlatformMuted(platform),
              onChanged: (value) => _save(context, ref, settings.withPlatformMuted(platform, value)),
            ),
          const _SectionLabel('Mute types'),
          for (final type in notificationTypes)
            SwitchListTile(
              title: Text(notificationTypeLabel(type)),
              value: settings.isTypeMuted(type),
              onChanged: (value) => _save(context, ref, settings.withTypeMuted(type, value)),
            ),
        ],
      );
    } else if (settingsAsync.hasError) {
      content = ErrorView(
        message: errorText(settingsAsync.error!),
        onRetry: () => ref.invalidate(notificationSettingsProvider),
      );
    } else {
      content = const Padding(
        padding: EdgeInsets.all(48),
        child: Center(child: CircularProgressIndicator()),
      );
    }

    return SafeArea(
      child: SingleChildScrollView(
        padding: const EdgeInsets.only(bottom: 12),
        child: content,
      ),
    );
  }
}

class _SectionLabel extends StatelessWidget {
  const _SectionLabel(this.text);

  final String text;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 4),
      child: Text(
        text.toUpperCase(),
        style: TextStyle(
          color: Theme.of(context).colorScheme.onSurfaceVariant,
          fontSize: 11,
          fontWeight: FontWeight.w700,
          letterSpacing: 0.8,
        ),
      ),
    );
  }
}
