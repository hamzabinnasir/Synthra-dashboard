import 'package:flutter_test/flutter_test.dart';
import 'package:synthra_mobile/features/comments/domain/comment.dart';
import 'package:synthra_mobile/features/inbox/domain/chat_platform.dart';

void main() {
  group('Comment.fromJson', () {
    final json = <String, dynamic>{
      'comment_id': 'c1',
      'post_id': 'p1',
      'from_id': '123456789',
      'from_name': 'Ali Khan',
      'message': 'What is the price?',
      'classification': 'question',
      'action': 'private_reply_sent',
      'created_at': '2026-10-25T10:00:00Z',
      'platform': 'facebook',
      'private_reply_sent': true,
      'author_custom_name': 'VIP Ali',
      'author_pic_url': 'https://example.com/a.jpg',
      'replies': [
        {
          'id': 'm-1',
          'kind': 'private',
          'by': 'bot',
          'text': ' Hi there ',
          'created_at': '2026-10-25T10:01:00Z',
        },
        {'id': 'l-2', 'kind': 'public', 'by': 'human', 'text': 'Thanks!'},
      ],
    };

    test('reads the enriched fields and replies', () {
      final comment = Comment.fromJson(json, fallbackPlatform: ChatPlatform.facebook);

      expect(comment.commentId, 'c1');
      expect(comment.platform, ChatPlatform.facebook);
      expect(comment.privateReplySent, isTrue);
      expect(comment.classification, 'question');
      expect(comment.createdAt, isNotNull);
      expect(comment.replies, hasLength(2));
      expect(comment.replies.first.isPrivate, isTrue);
      expect(comment.replies.first.byBot, isTrue);
      expect(comment.replies.first.text, 'Hi there');
      expect(comment.replies.last.isPrivate, isFalse);
      expect(comment.replies.last.byBot, isFalse);
    });

    test('names the commenter like an inbox conversation', () {
      final comment = Comment.fromJson(json, fallbackPlatform: ChatPlatform.facebook);

      expect(comment.titles.headline, 'VIP Ali');
      expect(comment.titles.subHeadline, 'Ali Khan');
    });

    test('survives a bare row with missing optional fields', () {
      final comment = Comment.fromJson(
        {'comment_id': 'c2', 'message': 'hi'},
        fallbackPlatform: ChatPlatform.instagram,
      );

      expect(comment.platform, ChatPlatform.instagram);
      expect(comment.replies, isEmpty);
      expect(comment.privateReplySent, isFalse);
      expect(comment.titles.headline, 'Unknown customer');
    });
  });

  test('deleted actions are recognised', () {
    expect(isDeletedCommentAction('deleted_by_admin'), isTrue);
    expect(isDeletedCommentAction('deleted_from_instagram'), isTrue);
    expect(isDeletedCommentAction('private_reply_sent'), isFalse);
    expect(isDeletedCommentAction(null), isFalse);
  });

  test('humanize turns action codes into labels', () {
    expect(humanize('private_reply_sent'), 'Private reply sent');
    expect(humanize(null), '');
  });

  test('each channel uses its own comment-bot switch', () {
    expect(ChatPlatform.facebook.commentBotSetting, 'comment_bot_active');
    expect(ChatPlatform.instagram.commentBotSetting, 'instagram_comment_bot_active');
  });
}
