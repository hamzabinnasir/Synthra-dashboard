import 'package:flutter/material.dart';

/// Colors copied from the web dashboard (`src/app/globals.css`) so both apps look alike.
class AppTheme {
  const AppTheme._();

  static ThemeData dark() => _build(
        const ColorScheme.dark(
          primary: Color(0xFF24D9E6),
          onPrimary: Color(0xFF04121D),
          secondary: Color(0xFF45D6E5),
          onSecondary: Color(0xFF04121D),
          surface: Color(0xFF0C1A29),
          onSurface: Color(0xFFF2F7FC),
          surfaceContainerHighest: Color(0xFF122438),
          onSurfaceVariant: Color(0xFF91A4B9),
          outline: Color(0xFF1C3044),
          error: Color(0xFFFFC5D4),
          onError: Color(0xFF301C31),
          errorContainer: Color(0xFF301C31),
          onErrorContainer: Color(0xFFFFC5D4),
        ),
        background: const Color(0xFF071321),
        header: const Color(0xFF0B1928),
      );

  static ThemeData light() => _build(
        const ColorScheme.light(
          primary: Color(0xFF286F58),
          onPrimary: Color(0xFFFFFFFF),
          secondary: Color(0xFF157A91),
          onSecondary: Color(0xFFFFFFFF),
          surface: Color(0xFFF8F4ED),
          onSurface: Color(0xFF263229),
          surfaceContainerHighest: Color(0xFFEEE7DC),
          onSurfaceVariant: Color(0xFF6F766E),
          outline: Color(0xFFD7D0C5),
        ),
        background: const Color(0xFFEEE8DE),
        header: const Color(0xFFF8F4ED),
      );

  static ThemeData _build(
    ColorScheme scheme, {
    required Color background,
    required Color header,
  }) {
    final border = OutlineInputBorder(
      borderRadius: BorderRadius.circular(12),
      borderSide: BorderSide(color: scheme.outline),
    );
    return ThemeData(
      useMaterial3: true,
      colorScheme: scheme,
      scaffoldBackgroundColor: background,
      appBarTheme: AppBarTheme(
        backgroundColor: header,
        foregroundColor: scheme.onSurface,
        elevation: 0,
        scrolledUnderElevation: 0,
        centerTitle: false,
      ),
      cardTheme: CardThemeData(
        color: scheme.surface,
        elevation: 0,
        margin: EdgeInsets.zero,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(16),
          side: BorderSide(color: scheme.outline),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: scheme.surfaceContainerHighest,
        border: border,
        enabledBorder: border,
        focusedBorder: border.copyWith(
          borderSide: BorderSide(color: scheme.primary, width: 1.5),
        ),
        errorBorder: border.copyWith(
          borderSide: BorderSide(color: scheme.error),
        ),
        focusedErrorBorder: border.copyWith(
          borderSide: BorderSide(color: scheme.error, width: 1.5),
        ),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          minimumSize: const Size.fromHeight(52),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
          ),
          textStyle: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
        ),
      ),
      snackBarTheme: const SnackBarThemeData(behavior: SnackBarBehavior.floating),
    );
  }
}
