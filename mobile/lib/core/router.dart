import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../features/auth/application/auth_controller.dart';
import '../features/auth/presentation/forgot_password_screen.dart';
import '../features/auth/presentation/login_screen.dart';
import '../features/auth/presentation/reset_password_screen.dart';
import '../features/auth/presentation/splash_screen.dart';
import '../features/home/home_screen.dart';

const _publicRoutes = {'/login', '/forgot-password', '/reset-password'};

final routerProvider = Provider<GoRouter>((ref) {
  // Re-run the redirect whenever the sign-in state changes.
  final refresh = ValueNotifier<int>(0);
  ref.listen(authControllerProvider, (_, _) => refresh.value++);
  ref.onDispose(refresh.dispose);

  final router = GoRouter(
    initialLocation: '/splash',
    refreshListenable: refresh,
    redirect: (context, state) {
      final status = ref.read(authControllerProvider).status;
      final location = state.matchedLocation;

      switch (status) {
        case AuthStatus.loading:
        case AuthStatus.unreachable:
          return location == '/splash' ? null : '/splash';
        case AuthStatus.unauthenticated:
          return _publicRoutes.contains(location) ? null : '/login';
        case AuthStatus.authenticated:
          return (location == '/splash' || _publicRoutes.contains(location)) ? '/' : null;
      }
    },
    routes: [
      GoRoute(path: '/splash', builder: (_, _) => const SplashScreen()),
      GoRoute(path: '/', builder: (_, _) => const HomeScreen()),
      GoRoute(path: '/login', builder: (_, _) => const LoginScreen()),
      GoRoute(path: '/forgot-password', builder: (_, _) => const ForgotPasswordScreen()),
      GoRoute(
        path: '/reset-password',
        builder: (_, state) => ResetPasswordScreen(initialToken: state.uri.queryParameters['token']),
      ),
    ],
  );
  ref.onDispose(router.dispose);
  return router;
});
