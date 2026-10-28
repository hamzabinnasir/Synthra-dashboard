import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Small key/value store for app preferences that must survive restarts (and stay after signing out).
class PreferenceStorage {
  PreferenceStorage([FlutterSecureStorage? storage]) : _storage = storage ?? const FlutterSecureStorage();

  final FlutterSecureStorage _storage;

  Future<String?> read(String key) => _storage.read(key: key);

  Future<void> write(String key, String value) => _storage.write(key: key, value: value);
}

final preferenceStorageProvider = Provider<PreferenceStorage>((ref) => PreferenceStorage());

/// Light, dark, or follow the phone. Remembered between launches.
final themeModeProvider = NotifierProvider<ThemeModeController, ThemeMode>(ThemeModeController.new);

class ThemeModeController extends Notifier<ThemeMode> {
  static const _key = 'theme_mode';

  PreferenceStorage get _storage => ref.read(preferenceStorageProvider);

  @override
  ThemeMode build() {
    Future.microtask(_load);
    return ThemeMode.system;
  }

  Future<void> _load() async {
    try {
      final saved = await _storage.read(_key);
      if (!ref.mounted) return;
      state = switch (saved) {
        'light' => ThemeMode.light,
        'dark' => ThemeMode.dark,
        _ => ThemeMode.system,
      };
    } on Object {
      // Storage unavailable: keep following the system setting.
    }
  }

  Future<void> select(ThemeMode mode) async {
    state = mode;
    try {
      await _storage.write(_key, mode.name);
    } on Object {
      // The choice still applies for this session.
    }
  }
}
