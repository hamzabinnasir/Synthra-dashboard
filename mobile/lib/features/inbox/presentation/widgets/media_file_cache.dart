import 'dart:io';

import 'package:dio/dio.dart';
import 'package:path_provider/path_provider.dart';

/// Downloads chat attachments to the app's cache folder so audio and documents can be played / opened
/// by other apps. Files are cached by URL, so opening the same attachment twice does not download it twice.
///
/// Uses its own [Dio] on purpose: the session token must only be sent to the dashboard's own media proxy
/// (callers pass [headers] for that), never to third-party hosts such as Cloudinary.
class MediaFileCache {
  const MediaFileCache._();

  static final Dio _dio = Dio(
    BaseOptions(
      connectTimeout: const Duration(seconds: 20),
      receiveTimeout: const Duration(minutes: 3),
    ),
  );

  static const _mimeToExtension = <String, String>{
    'audio/ogg': 'ogg',
    'audio/opus': 'opus',
    'audio/mpeg': 'mp3',
    'audio/mp4': 'm4a',
    'audio/aac': 'aac',
    'audio/amr': 'amr',
    'audio/wav': 'wav',
    'video/mp4': 'mp4',
    'video/3gpp': '3gp',
    'video/webm': 'webm',
    'application/pdf': 'pdf',
    'text/plain': 'txt',
    'application/msword': 'doc',
    'application/vnd.ms-excel': 'xls',
    'application/vnd.ms-powerpoint': 'ppt',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  };

  /// Returns the local copy of [url], downloading it first when needed.
  static Future<File> fetch({
    required String url,
    Map<String, String> headers = const {},
    String? filename,
    String? mimeType,
    void Function(int received, int total)? onProgress,
  }) async {
    final directory = Directory('${(await getTemporaryDirectory()).path}/chat_media');
    if (!await directory.exists()) await directory.create(recursive: true);

    final file = File('${directory.path}/${_fileNameFor(url, filename, mimeType)}');
    if (await file.exists() && await file.length() > 0) return file;

    // Download to a temporary name first so an interrupted download is never mistaken for a complete file.
    final partial = File('${file.path}.part');
    try {
      await _dio.download(
        url,
        partial.path,
        options: Options(headers: headers),
        onReceiveProgress: onProgress,
      );
      return await partial.rename(file.path);
    } catch (_) {
      if (await partial.exists()) await partial.delete();
      rethrow;
    }
  }

  static String _fileNameFor(String url, String? filename, String? mimeType) {
    final id = url.hashCode.toUnsigned(32).toRadixString(16);
    final safeName = (filename ?? '').replaceAll(RegExp(r'[^A-Za-z0-9._-]'), '_');
    if (safeName.isNotEmpty) return '${id}_$safeName';

    final mime = (mimeType ?? '').toLowerCase().split(';').first.trim();
    var extension = _mimeToExtension[mime];
    if (extension == null) {
      final path = Uri.tryParse(url)?.path ?? '';
      final dot = path.lastIndexOf('.');
      if (dot != -1 && path.length - dot <= 6) extension = path.substring(dot + 1);
    }
    return extension == null ? id : '$id.$extension';
  }
}
