import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';

import '../../../core/providers.dart';
import '../../../core/push_service.dart';
import '../../../core/theme_mode.dart';
import '../../auth/application/auth_controller.dart';
import '../../auth/domain/admin_user.dart';
import '../../inbox/presentation/widgets/common.dart';
import '../data/profile_repository.dart';

final profileRepositoryProvider = Provider<ProfileRepository>((ref) {
  return ProfileRepository(api: ref.watch(apiClientProvider));
});

/// The signed-in admin: name, password, app appearance and sign out.
class ProfilePage extends ConsumerWidget {
  const ProfilePage({super.key});

  Future<void> _confirmSignOut(BuildContext context, WidgetRef ref) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Sign out?'),
        content: const Text('You will need to sign in again to use the dashboard.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(dialogContext, false), child: const Text('Cancel')),
          TextButton(onPressed: () => Navigator.pop(dialogContext, true), child: const Text('Sign out')),
        ],
      ),
    );
    if (confirmed == true) await ref.read(authControllerProvider.notifier).logout();
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(authControllerProvider.select((state) => state.user));
    if (user == null) return const SizedBox.shrink();

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        _Header(user: user),
        const SizedBox(height: 16),
        _NameCard(user: user),
        const SizedBox(height: 12),
        const _PasswordCard(),
        const SizedBox(height: 12),
        const _AppearanceCard(),
        const SizedBox(height: 12),
        const _PushCard(),
        const SizedBox(height: 20),
        OutlinedButton.icon(
          onPressed: () => _confirmSignOut(context, ref),
          style: OutlinedButton.styleFrom(
            minimumSize: const Size.fromHeight(48),
            foregroundColor: Theme.of(context).colorScheme.error,
          ),
          icon: const Icon(Icons.logout_rounded),
          label: const Text('Sign out'),
        ),
      ],
    );
  }
}

class _Header extends ConsumerStatefulWidget {
  const _Header({required this.user});

  final AdminUser user;

  @override
  ConsumerState<_Header> createState() => _HeaderState();
}

enum _PhotoAction { gallery, camera, remove }

class _HeaderState extends ConsumerState<_Header> {
  bool _busy = false;

  Future<void> _changePhoto() async {
    final hasPhoto = widget.user.avatarUrl != null;
    final action = await showModalBottomSheet<_PhotoAction>(
      context: context,
      showDragHandle: true,
      builder: (sheetContext) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: const Icon(Icons.photo_library_outlined),
              title: const Text('Choose from library'),
              onTap: () => Navigator.pop(sheetContext, _PhotoAction.gallery),
            ),
            ListTile(
              leading: const Icon(Icons.photo_camera_outlined),
              title: const Text('Take a photo'),
              onTap: () => Navigator.pop(sheetContext, _PhotoAction.camera),
            ),
            if (hasPhoto)
              ListTile(
                leading: Icon(Icons.delete_outline_rounded, color: Theme.of(sheetContext).colorScheme.error),
                title: Text(
                  'Remove photo',
                  style: TextStyle(color: Theme.of(sheetContext).colorScheme.error),
                ),
                onTap: () => Navigator.pop(sheetContext, _PhotoAction.remove),
              ),
          ],
        ),
      ),
    );
    if (action == null || !mounted) return;

    setState(() => _busy = true);
    try {
      final repository = ref.read(profileRepositoryProvider);
      final AdminUser updated;
      if (action == _PhotoAction.remove) {
        updated = await repository.removeAvatar();
      } else {
        final picked = await ImagePicker().pickImage(
          source: action == _PhotoAction.camera ? ImageSource.camera : ImageSource.gallery,
          imageQuality: 85,
          maxWidth: 1024,
          maxHeight: 1024,
        );
        if (picked == null) {
          if (mounted) setState(() => _busy = false);
          return;
        }
        final bytes = await picked.readAsBytes();
        updated = await repository.updateAvatar(
          bytes,
          mimeType: picked.mimeType ?? _mimeFromName(picked.name),
        );
      }
      ref.read(authControllerProvider.notifier).updateUser(updated);
      if (!mounted) return;
      setState(() => _busy = false);
      ScaffoldMessenger.of(context)
        ..hideCurrentSnackBar()
        ..showSnackBar(
          SnackBar(content: Text(action == _PhotoAction.remove ? 'Photo removed' : 'Photo updated')),
        );
    } catch (error) {
      if (!mounted) return;
      setState(() => _busy = false);
      showError(context, error);
    }
  }

  static String _mimeFromName(String name) {
    final lower = name.toLowerCase();
    if (lower.endsWith('.png')) return 'image/png';
    if (lower.endsWith('.webp')) return 'image/webp';
    return 'image/jpeg';
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final user = widget.user;
    final name = user.displayName;
    return Row(
      children: [
        GestureDetector(
          onTap: _busy ? null : _changePhoto,
          child: Semantics(
            button: true,
            label: 'Change profile photo',
            child: SizedBox(
              width: 64,
              height: 64,
              child: Stack(
                clipBehavior: Clip.none,
                children: [
                  ContactAvatar(
                    initials: name.isEmpty ? '?' : name.substring(0, name.length.clamp(1, 2)).toUpperCase(),
                    imageUrl: user.avatarUrl,
                    size: 64,
                  ),
                  if (_busy)
                    Positioned.fill(
                      child: DecoratedBox(
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          color: scheme.scrim.withValues(alpha: 0.45),
                        ),
                        child: const Center(
                          child: SizedBox(
                            width: 24,
                            height: 24,
                            child: CircularProgressIndicator(strokeWidth: 2.5),
                          ),
                        ),
                      ),
                    ),
                  Positioned(
                    right: -2,
                    bottom: -2,
                    child: Container(
                      padding: const EdgeInsets.all(5),
                      decoration: BoxDecoration(
                        color: scheme.primary,
                        shape: BoxShape.circle,
                        border: Border.all(color: scheme.surface, width: 2),
                      ),
                      child: Icon(Icons.photo_camera_rounded, size: 13, color: scheme.onPrimary),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
        const SizedBox(width: 16),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(name, style: Theme.of(context).textTheme.titleLarge, maxLines: 1, overflow: TextOverflow.ellipsis),
              Text(
                user.email,
                style: TextStyle(color: scheme.onSurfaceVariant),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _CardShell extends StatelessWidget {
  const _CardShell({required this.title, required this.children});

  final String title;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(title, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
            const SizedBox(height: 12),
            ...children,
          ],
        ),
      ),
    );
  }
}

class _NameCard extends ConsumerStatefulWidget {
  const _NameCard({required this.user});

  final AdminUser user;

  @override
  ConsumerState<_NameCard> createState() => _NameCardState();
}

class _NameCardState extends ConsumerState<_NameCard> {
  late final _name = TextEditingController(text: widget.user.name);
  bool _saving = false;

  @override
  void dispose() {
    _name.dispose();
    super.dispose();
  }

  bool get _changed => _name.text.trim().isNotEmpty && _name.text.trim() != widget.user.name;

  Future<void> _save() async {
    setState(() => _saving = true);
    try {
      final updated = await ref.read(profileRepositoryProvider).updateName(_name.text.trim());
      ref.read(authControllerProvider.notifier).updateUser(updated);
      if (!mounted) return;
      setState(() => _saving = false);
      ScaffoldMessenger.of(context)
        ..hideCurrentSnackBar()
        ..showSnackBar(const SnackBar(content: Text('Profile updated')));
    } catch (error) {
      if (!mounted) return;
      setState(() => _saving = false);
      showError(context, error);
    }
  }

  @override
  Widget build(BuildContext context) {
    return _CardShell(
      title: 'Display name',
      children: [
        TextField(
          controller: _name,
          enabled: !_saving,
          textCapitalization: TextCapitalization.words,
          decoration: const InputDecoration(labelText: 'Name'),
          onChanged: (_) => setState(() {}),
        ),
        const SizedBox(height: 12),
        FilledButton(
          onPressed: _saving || !_changed ? null : _save,
          child: _saving
              ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2))
              : const Text('Save'),
        ),
      ],
    );
  }
}

class _PasswordCard extends ConsumerStatefulWidget {
  const _PasswordCard();

  @override
  ConsumerState<_PasswordCard> createState() => _PasswordCardState();
}

class _PasswordCardState extends ConsumerState<_PasswordCard> {
  final _current = TextEditingController();
  final _next = TextEditingController();
  final _confirm = TextEditingController();
  bool _saving = false;
  String? _problem;

  @override
  void dispose() {
    _current.dispose();
    _next.dispose();
    _confirm.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (_current.text.isEmpty) {
      setState(() => _problem = 'Enter your current password.');
      return;
    }
    if (_next.text.length < 8) {
      setState(() => _problem = 'The new password must be at least 8 characters.');
      return;
    }
    if (_next.text != _confirm.text) {
      setState(() => _problem = 'The new passwords do not match.');
      return;
    }
    setState(() {
      _problem = null;
      _saving = true;
    });
    try {
      await ref.read(profileRepositoryProvider).changePassword(current: _current.text, next: _next.text);
      if (!mounted) return;
      _current.clear();
      _next.clear();
      _confirm.clear();
      setState(() => _saving = false);
      ScaffoldMessenger.of(context)
        ..hideCurrentSnackBar()
        ..showSnackBar(const SnackBar(content: Text('Password changed')));
    } catch (error) {
      if (!mounted) return;
      setState(() => _saving = false);
      showError(context, error);
    }
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return _CardShell(
      title: 'Change password',
      children: [
        TextField(
          controller: _current,
          enabled: !_saving,
          obscureText: true,
          decoration: const InputDecoration(labelText: 'Current password'),
        ),
        const SizedBox(height: 10),
        TextField(
          controller: _next,
          enabled: !_saving,
          obscureText: true,
          decoration: const InputDecoration(labelText: 'New password'),
        ),
        const SizedBox(height: 10),
        TextField(
          controller: _confirm,
          enabled: !_saving,
          obscureText: true,
          decoration: const InputDecoration(labelText: 'Confirm new password'),
        ),
        if (_problem != null) ...[
          const SizedBox(height: 8),
          Text(_problem!, style: TextStyle(color: scheme.error, fontSize: 13)),
        ],
        const SizedBox(height: 12),
        FilledButton(
          onPressed: _saving ? null : _save,
          child: _saving
              ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2))
              : const Text('Update password'),
        ),
      ],
    );
  }
}

class _AppearanceCard extends ConsumerWidget {
  const _AppearanceCard();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final mode = ref.watch(themeModeProvider);
    return _CardShell(
      title: 'Appearance',
      children: [
        SegmentedButton<ThemeMode>(
          showSelectedIcon: false,
          segments: const [
            ButtonSegment(value: ThemeMode.system, icon: Icon(Icons.brightness_auto_rounded), label: Text('System')),
            ButtonSegment(value: ThemeMode.light, icon: Icon(Icons.light_mode_rounded), label: Text('Light')),
            ButtonSegment(value: ThemeMode.dark, icon: Icon(Icons.dark_mode_rounded), label: Text('Dark')),
          ],
          selected: {mode},
          onSelectionChanged: (value) => ref.read(themeModeProvider.notifier).select(value.first),
        ),
      ],
    );
  }
}

/// Lets the admin prove that background alerts work on this phone, and tells them what is wrong if they do not.
class _PushCard extends ConsumerStatefulWidget {
  const _PushCard();

  @override
  ConsumerState<_PushCard> createState() => _PushCardState();
}

class _PushCardState extends ConsumerState<_PushCard> {
  bool _testing = false;
  PushTestResult? _result;

  Future<void> _test() async {
    setState(() {
      _testing = true;
      _result = null;
    });
    final result = await ref.read(pushServiceProvider).sendTest();
    if (!mounted) return;
    setState(() {
      _testing = false;
      _result = result;
    });
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final result = _result;
    return _CardShell(
      title: 'Push notifications',
      children: [
        Text(
          'Alerts for new messages and comments arrive even when the app is closed. '
          'Send a test to check that this phone is set up correctly.',
          style: TextStyle(color: scheme.onSurfaceVariant, fontSize: 13),
        ),
        if (result != null) ...[
          const SizedBox(height: 10),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(
                result.ok ? Icons.check_circle_rounded : Icons.error_outline_rounded,
                size: 18,
                color: result.ok ? scheme.primary : scheme.error,
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  result.message,
                  style: TextStyle(color: result.ok ? scheme.onSurface : scheme.error, fontSize: 13),
                ),
              ),
            ],
          ),
        ],
        const SizedBox(height: 12),
        OutlinedButton.icon(
          onPressed: _testing ? null : _test,
          icon: _testing
              ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
              : const Icon(Icons.notifications_active_outlined),
          label: const Text('Send test notification'),
        ),
      ],
    );
  }
}
