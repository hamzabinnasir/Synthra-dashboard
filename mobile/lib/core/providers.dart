import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../features/auth/application/auth_controller.dart';
import 'api/api_client.dart';
import 'storage/token_storage.dart';

final tokenStorageProvider = Provider<TokenStorage>((ref) => TokenStorage());

/// One shared API client for the whole app. A 401 on a signed-in request returns the user to the login screen.
final apiClientProvider = Provider<ApiClient>((ref) {
  return ApiClient(
    tokens: ref.watch(tokenStorageProvider),
    onUnauthorized: () => ref.read(authControllerProvider.notifier).sessionExpired(),
  );
});
