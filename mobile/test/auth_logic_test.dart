import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:synthra_mobile/core/api/api_exception.dart';
import 'package:synthra_mobile/features/auth/domain/admin_user.dart';
import 'package:synthra_mobile/features/auth/domain/reset_token.dart';

void main() {
  group('extractResetToken', () {
    test('returns the token from a full reset link', () {
      expect(
        extractResetToken('https://dash.example.com/reset-password?token=abc123def'),
        'abc123def',
      );
    });

    test('accepts a bare token and trims whitespace', () {
      expect(extractResetToken('  abc123def \n'), 'abc123def');
    });

    test('finds token= inside surrounding text', () {
      expect(extractResetToken('open this: x/reset-password?token=zzz999 thanks'), 'zzz999');
    });

    test('empty input gives an empty token', () {
      expect(extractResetToken('   '), '');
    });
  });

  group('AdminUser.fromJson', () {
    test('parses the login response user', () {
      final user = AdminUser.fromJson({
        'id': 42,
        'email': 'owner@example.com',
        'name': 'Hamza',
        'avatar_url': 'https://img/a.png',
        'cover_url': '',
      });
      expect(user.id, '42');
      expect(user.displayName, 'Hamza');
      expect(user.avatarUrl, 'https://img/a.png');
      expect(user.coverUrl, isNull);
    });

    test('falls back to the email name when the name is empty', () {
      final user = AdminUser.fromJson({'id': 'x', 'email': 'owner@example.com', 'name': null});
      expect(user.displayName, 'owner');
    });
  });

  group('ApiException.fromDio', () {
    DioException failure({int? status, Object? data, DioExceptionType? type}) {
      final request = RequestOptions(path: '/api/x');
      return DioException(
        requestOptions: request,
        type: type ?? DioExceptionType.badResponse,
        response: status == null
            ? null
            : Response<dynamic>(requestOptions: request, statusCode: status, data: data),
      );
    }

    test('uses the server error message', () {
      final error = ApiException.fromDio(
        failure(status: 401, data: {'success': false, 'error': 'Invalid email or password'}),
      );
      expect(error.message, 'Invalid email or password');
      expect(error.isUnauthorized, isTrue);
    });

    test('explains a connection failure', () {
      final error = ApiException.fromDio(failure(type: DioExceptionType.connectionError));
      expect(error.isNetworkError, isTrue);
      expect(error.message, contains('Cannot reach the server'));
    });

    test('maps server errors without a body', () {
      final error = ApiException.fromDio(failure(status: 503));
      expect(error.message, contains('503'));
    });
  });
}
