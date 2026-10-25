/// The reset email contains a link like `https://host/reset-password?token=<hex>`.
/// People may paste the whole link or just the token, so accept both.
String extractResetToken(String input) {
  final text = input.trim();
  if (text.isEmpty) return '';

  final uri = Uri.tryParse(text);
  final fromQuery = uri?.queryParameters['token'];
  if (fromQuery != null && fromQuery.trim().isNotEmpty) return fromQuery.trim();

  final match = RegExp(r'token=([^&\s#]+)').firstMatch(text);
  if (match != null) return match.group(1)!;

  return text;
}
