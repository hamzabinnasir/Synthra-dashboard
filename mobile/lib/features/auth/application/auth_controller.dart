import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/api_exception.dart';
import '../../../core/providers.dart';
import '../../../core/push_service.dart';
import '../data/auth_repository.dart';
import '../domain/admin_user.dart';

final authRepositoryProvider = Provider<AuthRepository>((ref) {
  return AuthRepository(
    api: ref.watch(apiClientProvider),
    tokens: ref.watch(tokenStorageProvider),
  );
});

enum AuthStatus {
  /// Checking the stored session at startup.
  loading,

  /// A stored session exists but the server could not be reached to verify it.
  unreachable,

  authenticated,
  unauthenticated,
}

class AuthState {
  const AuthState._(this.status, {this.user, this.message});

  const AuthState.loading() : this._(AuthStatus.loading);
  const AuthState.unreachable(String message) : this._(AuthStatus.unreachable, message: message);
  const AuthState.authenticated(AdminUser user) : this._(AuthStatus.authenticated, user: user);
  const AuthState.unauthenticated({String? message})
      : this._(AuthStatus.unauthenticated, message: message);

  final AuthStatus status;
  final AdminUser? user;

  /// Extra text for the UI (why the server was unreachable, why the session ended).
  final String? message;
}

final authControllerProvider = NotifierProvider<AuthController, AuthState>(AuthController.new);

class AuthController extends Notifier<AuthState> {
  AuthRepository get _repo => ref.read(authRepositoryProvider);

  @override
  AuthState build() {
    Future.microtask(restoreSession);
    return const AuthState.loading();
  }

  /// Called at startup (and by the "Try again" button): resumes a saved session if the server accepts it.
  Future<void> restoreSession() async {
    state = const AuthState.loading();
    try {
      if (!await _repo.hasToken()) {
        state = const AuthState.unauthenticated();
        return;
      }
      final user = await _repo.fetchCurrentUser();
      state = AuthState.authenticated(user);
    } on ApiException catch (error) {
      if (error.isUnauthorized) {
        await _repo.clearSession();
        state = const AuthState.unauthenticated();
      } else {
        // Offline or server down: keep the saved session instead of signing the user out.
        state = AuthState.unreachable(error.message);
      }
    }
  }

  /// Throws [ApiException] with a user-facing message when sign-in fails.
  Future<void> login({required String email, required String password}) async {
    final user = await _repo.login(email: email, password: password);
    state = AuthState.authenticated(user);
  }

  /// Replaces the signed-in user's details after a profile edit.
  void updateUser(AdminUser user) {
    if (state.status != AuthStatus.authenticated) return;
    state = AuthState.authenticated(user);
  }

  Future<void> logout() async {
    // Stop push alerts for this phone while the session token still works (the server needs it).
    await ref.read(pushServiceProvider).unregister();
    await _repo.clearSession();
    state = const AuthState.unauthenticated();
  }

  /// The server rejected our token (expired or revoked).
  Future<void> sessionExpired() async {
    if (state.status == AuthStatus.unauthenticated) return;
    await _repo.clearSession();
    state = const AuthState.unauthenticated(
      message: 'Your session has expired. Please sign in again.',
    );
  }
}
