import 'package:flutter/material.dart';

import '../domain/comment.dart';
import 'widgets/comments_list.dart';

/// Comment moderation: one tab per channel that has comments (Facebook, Instagram).
class CommentsPage extends StatelessWidget {
  const CommentsPage({super.key});

  @override
  Widget build(BuildContext context) {
    return DefaultTabController(
      length: commentPlatforms.length,
      child: Column(
        children: [
          Material(
            color: Theme.of(context).colorScheme.surface,
            child: TabBar(
              tabs: [for (final platform in commentPlatforms) Tab(text: platform.label)],
            ),
          ),
          Expanded(
            child: TabBarView(
              children: [for (final platform in commentPlatforms) CommentsList(platform: platform)],
            ),
          ),
        ],
      ),
    );
  }
}
