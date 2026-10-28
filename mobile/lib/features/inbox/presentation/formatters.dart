import 'package:intl/intl.dart';

import '../../../core/config.dart';

/// Time shown on an inbox row: clock time today, "Yesterday", weekday this week, otherwise the date.
String formatListTime(DateTime? time, {DateTime? now}) {
  if (time == null) return '';
  final reference = now ?? DateTime.now();
  final today = DateTime(reference.year, reference.month, reference.day);
  final day = DateTime(time.year, time.month, time.day);
  final daysAgo = today.difference(day).inDays;
  if (daysAgo <= 0) return DateFormat.jm().format(time);
  if (daysAgo == 1) return 'Yesterday';
  if (daysAgo < 7) return DateFormat.E().format(time);
  return DateFormat.yMd().format(time);
}

/// Clock time inside a chat bubble.
String formatMessageTime(DateTime time) => DateFormat.jm().format(time);

/// Heading above the messages of one day in a chat.
String formatDayHeading(DateTime time, {DateTime? now}) {
  final reference = now ?? DateTime.now();
  final today = DateTime(reference.year, reference.month, reference.day);
  final day = DateTime(time.year, time.month, time.day);
  final daysAgo = today.difference(day).inDays;
  if (daysAgo <= 0) return 'Today';
  if (daysAgo == 1) return 'Yesterday';
  if (time.year == reference.year) return DateFormat.MMMEd().format(time);
  return DateFormat.yMMMEd().format(time);
}

bool isSameDay(DateTime a, DateTime b) => a.year == b.year && a.month == b.month && a.day == b.day;

/// Media links from WhatsApp/Meta need the dashboard's login-protected `/api/media-proxy`
/// (same rule as `getResolvedMediaUrl` in the web app). Other links (Cloudinary) are public.
class ResolvedMedia {
  const ResolvedMedia(this.url, {required this.needsAuth});

  final String url;

  /// True when [url] points at the dashboard itself, so the request must carry the session token.
  final bool needsAuth;
}

ResolvedMedia resolveMediaUrl(String rawUrl, {String? baseUrl}) {
  final trimmed = rawUrl.trim();
  final needsProxy = trimmed.contains('lookaside.fbsbx.com') ||
      trimmed.contains('graph.facebook.com') ||
      trimmed.startsWith('lookaside:');
  if (!needsProxy) return ResolvedMedia(trimmed, needsAuth: false);

  final base = (baseUrl ?? AppConfig.apiBaseUrl).replaceFirst(RegExp(r'/+$'), '');
  return ResolvedMedia('$base/api/media-proxy?url=${Uri.encodeComponent(trimmed)}', needsAuth: true);
}
