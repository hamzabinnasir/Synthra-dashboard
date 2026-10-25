import 'package:dio/dio.dart';

/// A readable error raised by the API layer. UI code shows [message] directly.
class ApiException implements Exception {
  const ApiException(this.message, {this.statusCode});

  final String message;
  final int? statusCode;

  bool get isUnauthorized => statusCode == 401;

  /// The request never got an answer (offline, wrong address, server down, timeout).
  bool get isNetworkError => statusCode == null;

  factory ApiException.fromDio(DioException error) {
    final status = error.response?.statusCode;
    final data = error.response?.data;

    // The dashboard answers errors as { success: false, error: "..." }.
    if (data is Map && data['error'] is String && (data['error'] as String).isNotEmpty) {
      return ApiException(data['error'] as String, statusCode: status);
    }

    switch (error.type) {
      case DioExceptionType.connectionTimeout:
      case DioExceptionType.sendTimeout:
      case DioExceptionType.receiveTimeout:
        return const ApiException('The server took too long to respond. Please try again.');
      case DioExceptionType.connectionError:
        return const ApiException(
          'Cannot reach the server. Check your internet connection and the server address.',
        );
      default:
        break;
    }

    if (status != null) {
      if (status == 401) {
        return ApiException('Your session has expired. Please sign in again.', statusCode: status);
      }
      if (status >= 500) {
        return ApiException('The server had a problem (error $status). Please try again.', statusCode: status);
      }
      return ApiException('Request failed (error $status).', statusCode: status);
    }
    return const ApiException('Something went wrong. Please try again.');
  }

  @override
  String toString() => message;
}
