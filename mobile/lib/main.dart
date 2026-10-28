import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'app.dart';
import 'core/push_service.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  // Push alerts only; the app still runs normally if Firebase is not configured for this build.
  await PushService.initializeFirebase();
  runApp(const ProviderScope(child: SynthraApp()));
}
