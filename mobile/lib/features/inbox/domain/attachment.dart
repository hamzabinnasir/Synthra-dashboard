import 'dart:io';

import '../../../core/api/api_exception.dart';

const _mb = 1024 * 1024;

enum AttachmentKind { image, video, audio, document }

/// A file the agent chose to send on WhatsApp, already checked against the same rules the server enforces
/// (`lib/whatsapp-media.js`): allowed types, and 5 MB for images / 10 MB for everything else.
class Attachment {
  const Attachment({
    required this.path,
    required this.name,
    required this.mimeType,
    required this.size,
    required this.kind,
  });

  final String path;
  final String name;
  final String mimeType;
  final int size;
  final AttachmentKind kind;

  int get maxBytes => kind == AttachmentKind.image ? 5 * _mb : 10 * _mb;

  /// Extensions the file picker should offer (everything WhatsApp accepts except photos, which have their own entry).
  static const pickableExtensions = [
    'mp4', '3gp', 'aac', 'm4a', 'mp3', 'amr', 'ogg', 'opus', //
    'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt',
    'jpg', 'jpeg', 'png',
  ];

  static const _kindByMime = <String, AttachmentKind>{
    'image/jpeg': AttachmentKind.image,
    'image/png': AttachmentKind.image,
    'video/mp4': AttachmentKind.video,
    'video/3gpp': AttachmentKind.video,
    'audio/aac': AttachmentKind.audio,
    'audio/mp4': AttachmentKind.audio,
    'audio/mpeg': AttachmentKind.audio,
    'audio/amr': AttachmentKind.audio,
    'audio/ogg': AttachmentKind.audio,
    'application/pdf': AttachmentKind.document,
    'application/msword': AttachmentKind.document,
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': AttachmentKind.document,
    'application/vnd.ms-excel': AttachmentKind.document,
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': AttachmentKind.document,
    'application/vnd.ms-powerpoint': AttachmentKind.document,
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': AttachmentKind.document,
    'text/plain': AttachmentKind.document,
  };

  static const _mimeByExtension = <String, String>{
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'png': 'image/png',
    'mp4': 'video/mp4',
    '3gp': 'video/3gpp',
    'aac': 'audio/aac',
    'm4a': 'audio/mp4',
    'mp3': 'audio/mpeg',
    'amr': 'audio/amr',
    'ogg': 'audio/ogg',
    'opus': 'audio/ogg',
    'pdf': 'application/pdf',
    'doc': 'application/msword',
    'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'xls': 'application/vnd.ms-excel',
    'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'ppt': 'application/vnd.ms-powerpoint',
    'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'txt': 'text/plain',
  };

  /// Builds an attachment from a file on disk, or throws an [ApiException] whose message says what is wrong.
  ///
  /// [mimeType] is the type reported by the picker; it is only trusted when WhatsApp supports it,
  /// otherwise the type is worked out from the file extension.
  static Future<Attachment> fromPath(String path, {String? name, String? mimeType}) async {
    final fileName = (name != null && name.isNotEmpty) ? name : path.split(RegExp(r'[\\/]')).last;

    var mime = _normalize(mimeType);
    if (mime == null || !_kindByMime.containsKey(mime)) {
      final dot = fileName.lastIndexOf('.');
      final extension = dot == -1 ? '' : fileName.substring(dot + 1).toLowerCase();
      mime = _mimeByExtension[extension];
    }
    final kind = mime == null ? null : _kindByMime[mime];
    if (mime == null || kind == null) {
      throw const ApiException(
        'WhatsApp cannot send this type of file. Use JPG/PNG, MP4, MP3/AAC/OGG audio, or PDF/Office documents.',
      );
    }

    final size = await File(path).length();
    if (size == 0) throw const ApiException('The selected file is empty.');

    final attachment = Attachment(path: path, name: fileName, mimeType: mime, size: size, kind: kind);
    if (size > attachment.maxBytes) {
      throw ApiException(
        'This file is ${formatBytes(size)}. The limit for this type is ${attachment.maxBytes ~/ _mb} MB.',
      );
    }
    return attachment;
  }

  static String? _normalize(String? mimeType) {
    if (mimeType == null) return null;
    final mime = mimeType.split(';').first.trim().toLowerCase();
    if (mime.isEmpty) return null;
    return mime == 'image/jpg' ? 'image/jpeg' : mime;
  }
}

String formatBytes(int bytes) {
  if (bytes >= _mb) return '${(bytes / _mb).toStringAsFixed(1)} MB';
  if (bytes >= 1024) return '${(bytes / 1024).round()} KB';
  return '$bytes B';
}
