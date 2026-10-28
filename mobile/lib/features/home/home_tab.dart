import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Bottom navigation destinations of the signed-in home screen.
abstract final class HomeTabs {
  static const inbox = 0;
  static const comments = 1;
  static const alerts = 2;
  static const profile = 3;
}

/// The selected home tab. A provider (instead of widget state) so other screens, like a tapped
/// notification about a comment, can switch tabs. Resets to the Inbox when the user signs out.
final homeTabProvider = NotifierProvider.autoDispose<HomeTabController, int>(HomeTabController.new);

class HomeTabController extends Notifier<int> {
  @override
  int build() => HomeTabs.inbox;

  void select(int index) => state = index;
}
