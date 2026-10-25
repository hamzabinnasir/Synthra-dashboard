import '../../../core/api/api_client.dart';
import '../../../core/api/api_exception.dart';
import '../../../core/storage/token_storage.dart';
import '../domain/admin_user.dart';

/// Talks to `/api/auth/*` and `/api/admin/profile` and owns the stored session token.
class AuthRepository {
  AuthRepository({required this._api, required this._tokens});

  final ApiClient _api;
  final TokenStorage _tokens;

  Future<bool> hasToken() async {
    final token = await _tokens.read();
    return token != null && token.isNotEmpty;
  }

  Future<AdminUser> login({required String email, required String password}) async {
    final json = await _api.post(
      '/api/auth/login',
      body: {'email': email.trim(), 'password': password},
    );

    final token = json['token'];
    final user = json['user'];
    if (token is! String || token.isEmpty || user is! Map) {
      throw const ApiException(
        'The server did not return a session. Make sure the dashboard has been updated for the mobile app.',
      );
    }

    await _tokens.write(token);
    return AdminUser.fromJson(Map<String, dynamic>.from(user));
  }

  /// Validates the stored token and returns the profile. Throws [ApiException] (401 = token no longer valid).
  Future<AdminUser> fetchCurrentUser() async {
    final json = await _api.get('/api/admin/profile');
    final user = json['user'];
    if (user is! Map) {
      throw const ApiException('Could not load your profile.');
    }
    return AdminUser.fromJson(Map<String, dynamic>.from(user));
  }

  /// Asks the server to email a reset link. Returns the server's message.
  Future<String> requestPasswordReset(String email) async {
    final json = await _api.post('/api/auth/forgot-password', body: {'email': email.trim()});
    return (json['message'] as String?) ??
        'If an account exists for that email, a password reset link has been sent.';
  }

  Future<String> resetPassword({required String token, required String newPassword}) async {
    final json = await _api.post(
      '/api/auth/reset-password',
      body: {'token': token, 'newPassword': newPassword},
    );
    return (json['message'] as String?) ?? 'Password has been successfully updated.';
  }

  Future<void> clearSession() => _tokens.clear();
}
