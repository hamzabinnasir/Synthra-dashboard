/// Build-time configuration.
///
/// Pass the dashboard address when running or building:
///   flutter run --dart-define=API_BASE_URL=https://your-dashboard.example.com
///
/// The default targets the web dashboard running on your PC (`npm run dev`) from the Android emulator,
/// where `10.0.2.2` is the host machine. On a real phone use your PC's LAN IP or the deployed URL.
class AppConfig {
  const AppConfig._();

  static const String apiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://10.0.2.2:3000',
  );
}
