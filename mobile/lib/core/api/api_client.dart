import 'package:dio/dio.dart';

import '../config.dart';
import '../storage/token_storage.dart';
import 'api_exception.dart';

/// Thin wrapper around Dio for the dashboard's JSON API.
///
/// * Sends `Authorization: Bearer <token>` once signed in.
/// * Identifies itself with `x-client-platform: mobile` (the login route then returns the token).
/// * Turns every failure into an [ApiException] with a message that is safe to show to the user.
/// * Calls [onUnauthorized] when a signed-in request gets a 401, so the app can return to the login screen.
class ApiClient {
  ApiClient({
    required this._tokens,
    required this._onUnauthorized,
    String? baseUrl,
  }) : dio = Dio(
          BaseOptions(
            baseUrl: baseUrl ?? AppConfig.apiBaseUrl,
            connectTimeout: const Duration(seconds: 15),
            sendTimeout: const Duration(seconds: 30),
            receiveTimeout: const Duration(seconds: 30),
            headers: const {
              'Accept': 'application/json',
              'x-client-platform': 'mobile',
            },
          ),
        ) {
    dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) async {
          final token = await _tokens.read();
          if (token != null && token.isNotEmpty) {
            options.headers['Authorization'] = 'Bearer $token';
            options.extra['hadToken'] = true;
          }
          handler.next(options);
        },
        onError: (error, handler) {
          final hadToken = error.requestOptions.extra['hadToken'] == true;
          final isAuthEndpoint = error.requestOptions.path.startsWith('/api/auth/');
          if (error.response?.statusCode == 401 && hadToken && !isAuthEndpoint) {
            _onUnauthorized();
          }
          handler.next(error);
        },
      ),
    );
  }

  /// Exposed for features that need more than plain JSON calls (uploads, streaming events).
  final Dio dio;

  final TokenStorage _tokens;
  final void Function() _onUnauthorized;

  Future<Map<String, dynamic>> get(
    String path, {
    Map<String, dynamic>? query,
  }) =>
      _send(() => dio.get<dynamic>(path, queryParameters: query));

  Future<Map<String, dynamic>> post(String path, {Object? body}) =>
      _send(() => dio.post<dynamic>(path, data: body));

  Future<Map<String, dynamic>> patch(String path, {Object? body}) =>
      _send(() => dio.patch<dynamic>(path, data: body));

  /// Multipart upload (files). Uploads can be large and the server forwards them to other services,
  /// so this uses much longer timeouts than ordinary JSON calls.
  Future<Map<String, dynamic>> postForm(
    String path,
    FormData form, {
    void Function(int sent, int total)? onProgress,
  }) =>
      _send(
        () => dio.post<dynamic>(
          path,
          data: form,
          onSendProgress: onProgress,
          options: Options(
            sendTimeout: const Duration(minutes: 3),
            receiveTimeout: const Duration(minutes: 2),
          ),
        ),
      );


  Future<Map<String, dynamic>> delete(String path, {Object? body}) =>
      _send(() => dio.delete<dynamic>(path, data: body));

  Future<Map<String, dynamic>> _send(Future<Response<dynamic>> Function() call) async {
    try {
      final response = await call();
      final data = response.data;
      final json = data is Map ? Map<String, dynamic>.from(data) : <String, dynamic>{};
      if (json['success'] == false) {
        throw ApiException(
          (json['error'] as String?) ?? 'Request failed.',
          statusCode: response.statusCode,
        );
      }
      return json;
    } on DioException catch (error) {
      throw ApiException.fromDio(error);
    }
  }
}
