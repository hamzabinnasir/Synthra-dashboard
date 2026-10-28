import 'dart:async';
import 'dart:convert';

import 'package:dio/dio.dart';

/// One Server-Sent Event from the dashboard (`event: name` + `data: json`).
class SseEvent {
  const SseEvent(this.name, this.data);

  final String name;
  final String data;

  /// Decodes [data] as a JSON object, or null when it is empty or not an object.
  Map<String, dynamic>? get json {
    if (data.isEmpty) return null;
    try {
      final decoded = jsonDecode(data);
      return decoded is Map ? Map<String, dynamic>.from(decoded) : null;
    } on FormatException {
      return null;
    }
  }
}

/// Emitted by [sseStream] (not by the server) whenever the connection drops, before it reconnects.
const String sseDisconnected = 'disconnected';

/// Turns decoded text lines into events. A blank line ends an event; lines starting with `:` are
/// comments (the server's keep-alives) and are ignored.
Stream<SseEvent> parseSseLines(Stream<String> lines) async* {
  var name = 'message';
  final data = <String>[];
  await for (final line in lines) {
    if (line.isEmpty) {
      if (data.isNotEmpty) yield SseEvent(name, data.join('\n'));
      name = 'message';
      data.clear();
    } else if (line.startsWith(':')) {
      continue;
    } else if (line.startsWith('event:')) {
      name = line.substring(6).trim();
    } else if (line.startsWith('data:')) {
      data.add(line.substring(5).trimLeft());
    }
  }
}

/// Opens an authenticated SSE connection and keeps it open: if it drops it emits [sseDisconnected]
/// and reconnects with a growing delay (2s up to 30s). Cancel the subscription to close it.
///
/// SSE only runs while the app is in the foreground; background alerts need push (Stage 5).
Stream<SseEvent> sseStream(Dio dio, String path, {Map<String, dynamic>? query}) {
  late final StreamController<SseEvent> controller;
  CancelToken? cancelToken;
  var active = false;

  Future<void> run() async {
    var delay = const Duration(seconds: 2);
    while (active) {
      final token = CancelToken();
      cancelToken = token;
      try {
        final response = await dio.get<ResponseBody>(
          path,
          queryParameters: query,
          cancelToken: token,
          options: Options(
            responseType: ResponseType.stream,
            // The server sends a keep-alive every 15-20s, so silence this long means a dead connection.
            receiveTimeout: const Duration(seconds: 60),
            headers: const {'Accept': 'text/event-stream', 'Cache-Control': 'no-cache'},
          ),
        );
        final body = response.data;
        if (body != null) {
          delay = const Duration(seconds: 2);
          final lines = body.stream
              .cast<List<int>>()
              .transform(utf8.decoder)
              .transform(const LineSplitter());
          await for (final event in parseSseLines(lines)) {
            if (!active) break;
            controller.add(event);
          }
        }
      } on Object {
        // Dropped, timed out, or cancelled: handled below.
      }
      if (!active) break;
      controller.add(const SseEvent(sseDisconnected, ''));
      await Future<void>.delayed(delay);
      final doubled = delay * 2;
      delay = doubled > const Duration(seconds: 30) ? const Duration(seconds: 30) : doubled;
    }
  }

  controller = StreamController<SseEvent>(
    onListen: () {
      active = true;
      unawaited(run());
    },
    onCancel: () {
      active = false;
      cancelToken?.cancel();
    },
  );
  return controller.stream;
}
