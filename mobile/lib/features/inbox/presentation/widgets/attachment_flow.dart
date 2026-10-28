import 'dart:io';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';

import '../../../../core/api/api_exception.dart';
import '../../application/chat_controller.dart';
import '../../domain/attachment.dart';
import 'common.dart';

enum _Source { gallery, camera, file }

/// Attach flow for a WhatsApp chat: choose where to pick from, check the file, preview it with an optional
/// caption, upload it and show progress. Errors are shown as snack bars; nothing is lost on failure.
Future<void> pickAndSendAttachment(BuildContext context, WidgetRef ref, String psid) async {
  final source = await showModalBottomSheet<_Source>(
    context: context,
    showDragHandle: true,
    builder: (sheetContext) => SafeArea(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          ListTile(
            leading: const Icon(Icons.photo_library_outlined),
            title: const Text('Photo library'),
            onTap: () => Navigator.pop(sheetContext, _Source.gallery),
          ),
          ListTile(
            leading: const Icon(Icons.photo_camera_outlined),
            title: const Text('Take a photo'),
            onTap: () => Navigator.pop(sheetContext, _Source.camera),
          ),
          ListTile(
            leading: const Icon(Icons.attach_file_rounded),
            title: const Text('Document, video or audio'),
            onTap: () => Navigator.pop(sheetContext, _Source.file),
          ),
        ],
      ),
    ),
  );
  if (source == null || !context.mounted) return;

  final Attachment? attachment;
  try {
    attachment = await _pick(source);
  } catch (error) {
    if (context.mounted) showError(context, error);
    return;
  }
  if (attachment == null || !context.mounted) return;

  await showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    isDismissible: false,
    enableDrag: false,
    showDragHandle: true,
    builder: (_) => _AttachmentSheet(psid: psid, attachment: attachment!),
  );
}

Future<Attachment?> _pick(_Source source) async {
  switch (source) {
    case _Source.gallery:
    case _Source.camera:
      final picked = await ImagePicker().pickImage(
        source: source == _Source.camera ? ImageSource.camera : ImageSource.gallery,
        imageQuality: 85,
        maxWidth: 2048,
        maxHeight: 2048,
      );
      if (picked == null) return null;
      return Attachment.fromPath(picked.path, name: picked.name, mimeType: picked.mimeType);
    case _Source.file:
      final file = await FilePicker.pickFile(
        type: FileType.custom,
        allowedExtensions: Attachment.pickableExtensions,
      );
      if (file == null) return null;
      final path = file.path;
      if (path == null) throw const ApiException('Could not open that file. Try copying it to this device first.');
      return Attachment.fromPath(path, name: file.name);
  }
}

class _AttachmentSheet extends ConsumerStatefulWidget {
  const _AttachmentSheet({required this.psid, required this.attachment});

  final String psid;
  final Attachment attachment;

  @override
  ConsumerState<_AttachmentSheet> createState() => _AttachmentSheetState();
}

class _AttachmentSheetState extends ConsumerState<_AttachmentSheet> {
  final _caption = TextEditingController();
  bool _sending = false;
  double? _progress;

  @override
  void dispose() {
    _caption.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    setState(() {
      _sending = true;
      _progress = 0;
    });
    try {
      await ref.read(chatControllerProvider(widget.psid).notifier).sendMedia(
            widget.attachment,
            caption: _caption.text,
            onProgress: (sent, total) {
              if (mounted && total > 0) setState(() => _progress = sent / total);
            },
          );
      if (mounted) Navigator.pop(context);
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _sending = false;
        _progress = null;
      });
      showError(context, error);
    }
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final attachment = widget.attachment;
    // Voice/audio messages cannot carry a caption on WhatsApp.
    final canCaption = attachment.kind != AttachmentKind.audio;

    return PopScope(
      canPop: !_sending,
      child: Padding(
        padding: EdgeInsets.fromLTRB(16, 0, 16, 16 + MediaQuery.viewInsetsOf(context).bottom),
        child: SafeArea(
          top: false,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              ClipRRect(
                borderRadius: BorderRadius.circular(12),
                child: attachment.kind == AttachmentKind.image
                    ? ConstrainedBox(
                        constraints: const BoxConstraints(maxHeight: 260),
                        child: Image.file(File(attachment.path), fit: BoxFit.contain),
                      )
                    : Container(
                        padding: const EdgeInsets.all(16),
                        color: scheme.surfaceContainerHighest,
                        child: Row(
                          children: [
                            Icon(_iconFor(attachment.kind), size: 36, color: scheme.primary),
                            const SizedBox(width: 12),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(attachment.name, maxLines: 2, overflow: TextOverflow.ellipsis),
                                  Text(
                                    formatBytes(attachment.size),
                                    style: TextStyle(color: scheme.onSurfaceVariant, fontSize: 12),
                                  ),
                                ],
                              ),
                            ),
                          ],
                        ),
                      ),
              ),
              if (canCaption) ...[
                const SizedBox(height: 12),
                TextField(
                  controller: _caption,
                  enabled: !_sending,
                  maxLength: 1024,
                  minLines: 1,
                  maxLines: 3,
                  textCapitalization: TextCapitalization.sentences,
                  decoration: const InputDecoration(hintText: 'Add a caption (optional)', counterText: ''),
                ),
              ],
              const SizedBox(height: 12),
              if (_sending) ...[
                LinearProgressIndicator(value: _progress == null || _progress! >= 1 ? null : _progress),
                const SizedBox(height: 8),
                Text(
                  (_progress ?? 0) >= 1 ? 'Sending to WhatsApp…' : 'Uploading…',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: scheme.onSurfaceVariant, fontSize: 12),
                ),
              ] else
                Row(
                  children: [
                    Expanded(
                      child: OutlinedButton(onPressed: () => Navigator.pop(context), child: const Text('Cancel')),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: FilledButton.icon(
                        onPressed: _send,
                        icon: const Icon(Icons.send_rounded),
                        label: const Text('Send'),
                      ),
                    ),
                  ],
                ),
            ],
          ),
        ),
      ),
    );
  }

  IconData _iconFor(AttachmentKind kind) => switch (kind) {
        AttachmentKind.image => Icons.image_outlined,
        AttachmentKind.video => Icons.videocam_outlined,
        AttachmentKind.audio => Icons.audiotrack_outlined,
        AttachmentKind.document => Icons.description_outlined,
      };
}
