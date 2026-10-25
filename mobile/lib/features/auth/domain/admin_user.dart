/// The signed-in dashboard administrator (`admin_users` row, without the password hash).
class AdminUser {
  const AdminUser({
    required this.id,
    required this.email,
    required this.name,
    this.avatarUrl,
    this.coverUrl,
  });

  final String id;
  final String email;
  final String name;
  final String? avatarUrl;
  final String? coverUrl;

  /// Name to show in the UI; falls back to the part of the email before the `@`.
  String get displayName {
    final trimmed = name.trim();
    if (trimmed.isNotEmpty) return trimmed;
    final at = email.indexOf('@');
    return at > 0 ? email.substring(0, at) : email;
  }

  factory AdminUser.fromJson(Map<String, dynamic> json) {
    String? optional(Object? value) {
      final text = value?.toString().trim();
      return (text == null || text.isEmpty) ? null : text;
    }

    return AdminUser(
      id: '${json['id']}',
      email: (json['email'] as String?) ?? '',
      name: (json['name'] as String?) ?? '',
      avatarUrl: optional(json['avatar_url']),
      coverUrl: optional(json['cover_url']),
    );
  }
}
