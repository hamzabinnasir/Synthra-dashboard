import 'dart:convert';
import 'dart:typed_data';

import '../../../core/api/api_client.dart';
import '../../../core/api/api_exception.dart';
import '../../auth/domain/admin_user.dart';

/// Talks to `POST /api/admin/profile` (the same endpoint the web profile page uses).
class ProfileRepository {
  ProfileRepository({required this._api});

  final ApiClient _api;

  /// The server accepts JPEG, PNG or WebP up to 5 MB.
  static const maxAvatarBytes = 5 * 1024 * 1024;
  static const _allowedMimeTypes = {'image/jpeg', 'image/png', 'image/webp'};

  /// Saves a new display name and returns the updated user.
  Future<AdminUser> updateName(String name) async {
    final json = await _api.post('/api/admin/profile', body: {'name': name});
    return _userFrom(json);
  }

  /// The server checks [current] and requires the new password to have at least 8 characters.
  Future<void> changePassword({required String current, required String next}) async {
    await _api.post(
      '/api/admin/profile',
      body: {'currentPassword': current, 'newPassword': next},
    );
  }

  /// Uploads a new profile photo. The web endpoint takes the image as a base64 data URL in `avatar`
  /// and stores it on Cloudinary; the returned user carries the new `avatar_url`.
  Future<AdminUser> updateAvatar(Uint8List bytes, {required String mimeType}) async {
    final mime = mimeType.toLowerCase() == 'image/jpg' ? 'image/jpeg' : mimeType.toLowerCase();
    if (!_allowedMimeTypes.contains(mime)) {
      throw const ApiException('Choose a JPEG, PNG or WebP image.');
    }
    if (bytes.lengthInBytes > maxAvatarBytes) {
      throw const ApiException('That image is larger than 5 MB.');
    }
    final json = await _api.post(
      '/api/admin/profile',
      body: {'avatar': 'data:$mime;base64,${base64Encode(bytes)}'},
    );
    return _userFrom(json);
  }

  /// Removes the profile photo (the server accepts `null` and deletes the stored image).
  Future<AdminUser> removeAvatar() async {
    final json = await _api.post('/api/admin/profile', body: {'avatar': null});
    return _userFrom(json);
  }

  AdminUser _userFrom(Map<String, dynamic> json) =>
      AdminUser.fromJson(Map<String, dynamic>.from(json['user'] as Map));
}
