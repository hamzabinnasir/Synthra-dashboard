import 'dart:async';

import 'package:audioplayers/audioplayers.dart';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:open_filex/open_filex.dart';
import 'package:video_player/video_player.dart';

import '../../../../core/providers.dart';
import '../../domain/chat_message.dart';
import '../formatters.dart';
import 'media_file_cache.dart';

/// Headers for media that comes from the dashboard's own `/api/media-proxy` (login-protected).
final mediaHeadersProvider = FutureProvider<Map<String, String>>((ref) async {
  final token = await ref.read(tokenStorageProvider).read();
  if (token == null || token.isEmpty) return const {};
  return {'Authorization': 'Bearer $token'};
});

/// Headers for [media]: the session token only for our own proxy, nothing for third-party hosts.
Future<Map<String, String>> _headersFor(WidgetRef ref, ResolvedMedia media) async {
  if (!media.needsAuth) return const {};
  return ref.read(mediaHeadersProvider.future);
}

void _toast(BuildContext context, String text) {
  ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(content: Text(text)));
}

/// The attachment of a message: pictures inline, video with a play tile, audio with a player bar,
/// and documents that download and open in the phone's own viewer.
class MessageMedia extends ConsumerWidget {
  const MessageMedia({super.key, required this.message});

  final ChatMessage message;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final scheme = Theme.of(context).colorScheme;
    final url = message.mediaUrl;

    if (message.mediaUnavailable || url == null) {
      return _InfoCard(
        icon: Icons.broken_image_outlined,
        title: 'Media unavailable',
        subtitle: 'The original link expired or the upload failed.',
        color: scheme.onSurfaceVariant,
      );
    }

    switch (message.mediaKind) {
      case MediaKind.image:
        return _InlineImage(url: url, title: message.mediaFilename);
      case MediaKind.video:
        return _VideoTile(url: url, title: message.mediaFilename);
      case MediaKind.audio:
        return _AudioPlayerBar(
          url: url,
          mimeType: message.mediaMimeType,
          isVoice: message.mediaType?.toLowerCase() == 'voice',
        );
      default:
        return _DocumentTile(
          url: url,
          filename: message.mediaFilename,
          mimeType: message.mediaMimeType,
        );
    }
  }
}

class _InfoCard extends StatelessWidget {
  const _InfoCard({
    required this.icon,
    required this.title,
    required this.color,
    this.subtitle,
    this.trailing,
  });

  final IconData icon;
  final String title;
  final String? subtitle;
  final Color color;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: scheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, color: color, size: 28),
          const SizedBox(width: 10),
          Flexible(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, maxLines: 2, overflow: TextOverflow.ellipsis),
                if (subtitle != null)
                  Text(subtitle!, style: TextStyle(color: scheme.onSurfaceVariant, fontSize: 12)),
              ],
            ),
          ),
          if (trailing != null) ...[const SizedBox(width: 8), trailing!],
        ],
      ),
    );
  }
}

// ───────────────────────── Images ─────────────────────────

class _InlineImage extends ConsumerWidget {
  const _InlineImage({required this.url, this.title});

  final String url;
  final String? title;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final media = resolveMediaUrl(url);
    // Only attach the session token to our own proxy, never to third-party hosts.
    final headers = media.needsAuth ? ref.watch(mediaHeadersProvider).value : const <String, String>{};
    final scheme = Theme.of(context).colorScheme;

    Widget placeholder({bool failed = false}) => Container(
          width: 220,
          height: 160,
          alignment: Alignment.center,
          color: scheme.surfaceContainerHighest,
          child: failed
              ? Icon(Icons.broken_image_outlined, color: scheme.onSurfaceVariant)
              : const SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2)),
        );

    if (headers == null) return placeholder();

    return GestureDetector(
      onTap: () => Navigator.of(context).push(
        MaterialPageRoute<void>(
          builder: (_) => ImageViewerScreen(url: media.url, headers: headers, title: title),
        ),
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(12),
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 260, maxHeight: 300),
          child: CachedNetworkImage(
            imageUrl: media.url,
            httpHeaders: headers,
            fit: BoxFit.cover,
            placeholder: (_, _) => placeholder(),
            errorWidget: (_, _, _) => placeholder(failed: true),
          ),
        ),
      ),
    );
  }
}

/// Full-screen picture with pinch-to-zoom.
class ImageViewerScreen extends StatelessWidget {
  const ImageViewerScreen({super.key, required this.url, required this.headers, this.title});

  final String url;
  final Map<String, String> headers;
  final String? title;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        backgroundColor: Colors.black,
        foregroundColor: Colors.white,
        title: Text(title ?? 'Photo', style: const TextStyle(fontSize: 16)),
      ),
      body: InteractiveViewer(
        maxScale: 5,
        child: Center(
          child: CachedNetworkImage(
            imageUrl: url,
            httpHeaders: headers,
            fit: BoxFit.contain,
            placeholder: (_, _) => const CircularProgressIndicator(),
            errorWidget: (_, _, _) => const Icon(Icons.broken_image_outlined, color: Colors.white54, size: 48),
          ),
        ),
      ),
    );
  }
}

// ───────────────────────── Video ─────────────────────────

class _VideoTile extends ConsumerWidget {
  const _VideoTile({required this.url, this.title});

  final String url;
  final String? title;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return GestureDetector(
      onTap: () async {
        final media = resolveMediaUrl(url);
        final headers = await _headersFor(ref, media);
        if (!context.mounted) return;
        await Navigator.of(context).push(
          MaterialPageRoute<void>(
            builder: (_) => VideoViewerScreen(url: media.url, headers: headers, title: title),
          ),
        );
      },
      child: ClipRRect(
        borderRadius: BorderRadius.circular(12),
        child: Container(
          width: 240,
          height: 150,
          color: Colors.black87,
          alignment: Alignment.center,
          child: Stack(
            alignment: Alignment.center,
            children: [
              const Icon(Icons.play_circle_fill_rounded, color: Colors.white, size: 56),
              Positioned(
                left: 10,
                bottom: 8,
                right: 10,
                child: Row(
                  children: [
                    const Icon(Icons.videocam_rounded, color: Colors.white70, size: 16),
                    const SizedBox(width: 6),
                    Expanded(
                      child: Text(
                        title ?? 'Video',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(color: Colors.white70, fontSize: 12),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Full-screen video player with play/pause and a scrubber.
class VideoViewerScreen extends StatefulWidget {
  const VideoViewerScreen({super.key, required this.url, required this.headers, this.title});

  final String url;
  final Map<String, String> headers;
  final String? title;

  @override
  State<VideoViewerScreen> createState() => _VideoViewerScreenState();
}

class _VideoViewerScreenState extends State<VideoViewerScreen> {
  late final VideoPlayerController _controller;
  Object? _error;

  @override
  void initState() {
    super.initState();
    _controller = VideoPlayerController.networkUrl(Uri.parse(widget.url), httpHeaders: widget.headers)
      ..addListener(() {
        if (mounted) setState(() {});
      });
    _controller.initialize().then((_) {
      if (!mounted) return;
      setState(() {});
      unawaited(_controller.play());
    }).catchError((Object error) {
      if (mounted) setState(() => _error = error);
    });
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final value = _controller.value;
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        backgroundColor: Colors.black,
        foregroundColor: Colors.white,
        title: Text(widget.title ?? 'Video', style: const TextStyle(fontSize: 16)),
      ),
      body: _error != null
          ? const Center(
              child: Padding(
                padding: EdgeInsets.all(24),
                child: Text(
                  'This video could not be played. The link may have expired or the format is not supported.',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: Colors.white70),
                ),
              ),
            )
          : !value.isInitialized
              ? const Center(child: CircularProgressIndicator())
              : Column(
                  children: [
                    Expanded(
                      child: Center(
                        child: AspectRatio(
                          aspectRatio: value.aspectRatio == 0 ? 16 / 9 : value.aspectRatio,
                          child: VideoPlayer(_controller),
                        ),
                      ),
                    ),
                    VideoProgressIndicator(_controller, allowScrubbing: true, padding: const EdgeInsets.all(12)),
                    Padding(
                      padding: const EdgeInsets.only(bottom: 24),
                      child: IconButton(
                        iconSize: 48,
                        color: Colors.white,
                        icon: Icon(value.isPlaying ? Icons.pause_circle_filled_rounded : Icons.play_circle_fill_rounded),
                        onPressed: () => value.isPlaying ? _controller.pause() : _controller.play(),
                      ),
                    ),
                  ],
                ),
    );
  }
}

// ───────────────────────── Audio / voice notes ─────────────────────────

class _AudioPlayerBar extends ConsumerStatefulWidget {
  const _AudioPlayerBar({required this.url, required this.isVoice, this.mimeType});

  final String url;
  final String? mimeType;
  final bool isVoice;

  @override
  ConsumerState<_AudioPlayerBar> createState() => _AudioPlayerBarState();
}

class _AudioPlayerBarState extends ConsumerState<_AudioPlayerBar> {
  AudioPlayer? _player;
  final _subscriptions = <StreamSubscription<dynamic>>[];

  bool _loading = false;
  bool _playing = false;
  bool _failed = false;
  Duration _position = Duration.zero;
  Duration _duration = Duration.zero;

  @override
  void dispose() {
    for (final subscription in _subscriptions) {
      unawaited(subscription.cancel());
    }
    unawaited(_player?.dispose());
    super.dispose();
  }

  Future<void> _toggle() async {
    final existing = _player;
    if (existing != null) {
      if (_playing) {
        await existing.pause();
      } else {
        await existing.resume();
      }
      return;
    }

    setState(() {
      _loading = true;
      _failed = false;
    });
    try {
      final media = resolveMediaUrl(widget.url);
      final headers = await _headersFor(ref, media);
      final file = await MediaFileCache.fetch(url: media.url, headers: headers, mimeType: widget.mimeType);
      if (!mounted) return;

      final player = AudioPlayer();
      _player = player;
      _subscriptions
        ..add(player.onPlayerStateChanged.listen((state) {
          if (mounted) setState(() => _playing = state == PlayerState.playing);
        }))
        ..add(player.onPositionChanged.listen((position) {
          if (mounted) setState(() => _position = position);
        }))
        ..add(player.onDurationChanged.listen((duration) {
          if (mounted) setState(() => _duration = duration);
        }))
        ..add(player.onPlayerComplete.listen((_) {
          if (mounted) setState(() => _position = Duration.zero);
        }));
      await player.play(DeviceFileSource(file.path));
    } catch (_) {
      if (mounted) setState(() => _failed = true);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  String _format(Duration value) {
    final minutes = value.inMinutes.remainder(60).toString().padLeft(2, '0');
    final seconds = value.inSeconds.remainder(60).toString().padLeft(2, '0');
    return '$minutes:$seconds';
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final total = _duration.inMilliseconds;
    final progress = total == 0 ? 0.0 : (_position.inMilliseconds / total).clamp(0.0, 1.0);

    return Container(
      width: 240,
      padding: const EdgeInsets.fromLTRB(4, 4, 12, 4),
      decoration: BoxDecoration(
        color: scheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        children: [
          _loading
              ? const SizedBox(
                  width: 48,
                  height: 48,
                  child: Padding(padding: EdgeInsets.all(13), child: CircularProgressIndicator(strokeWidth: 2.5)),
                )
              : IconButton(
                  onPressed: _toggle,
                  icon: Icon(
                    _failed
                        ? Icons.refresh_rounded
                        : (_playing ? Icons.pause_circle_filled_rounded : Icons.play_circle_fill_rounded),
                    color: _failed ? scheme.error : scheme.primary,
                    size: 36,
                  ),
                ),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (_failed)
                  Text('Could not play. Tap to retry.', style: TextStyle(color: scheme.error, fontSize: 12))
                else ...[
                  LinearProgressIndicator(value: progress, minHeight: 3),
                  const SizedBox(height: 4),
                  Text(
                    '${widget.isVoice ? 'Voice note' : 'Audio'} · ${_format(_playing || _position > Duration.zero ? _position : _duration)}',
                    style: TextStyle(color: scheme.onSurfaceVariant, fontSize: 12),
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

// ───────────────────────── Documents ─────────────────────────

class _DocumentTile extends ConsumerStatefulWidget {
  const _DocumentTile({required this.url, this.filename, this.mimeType});

  final String url;
  final String? filename;
  final String? mimeType;

  @override
  ConsumerState<_DocumentTile> createState() => _DocumentTileState();
}

class _DocumentTileState extends ConsumerState<_DocumentTile> {
  bool _busy = false;

  Future<void> _open() async {
    if (_busy) return;
    setState(() => _busy = true);
    try {
      final media = resolveMediaUrl(widget.url);
      final headers = await _headersFor(ref, media);
      final file = await MediaFileCache.fetch(
        url: media.url,
        headers: headers,
        filename: widget.filename,
        mimeType: widget.mimeType,
      );
      final result = await OpenFilex.open(file.path, type: widget.mimeType);
      if (mounted && result.type != ResultType.done) {
        _toast(context, 'No app on this phone can open this file.');
      }
    } catch (_) {
      if (mounted) _toast(context, 'Could not download this file. Check your connection and try again.');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return InkWell(
      borderRadius: BorderRadius.circular(12),
      onTap: _open,
      child: _InfoCard(
        icon: Icons.insert_drive_file_rounded,
        title: widget.filename ?? 'Document',
        subtitle: _busy ? 'Downloading…' : 'Tap to open',
        color: scheme.primary,
        trailing: _busy
            ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
            : Icon(Icons.open_in_new_rounded, size: 18, color: scheme.onSurfaceVariant),
      ),
    );
  }
}
