import 'package:flutter/material.dart';

import '../../domain/chat_message.dart';
import '../formatters.dart';
import 'message_media.dart';

/// One chat bubble: customer messages on the left, replies (bot or human agent) on the right.
class MessageBubble extends StatelessWidget {
  const MessageBubble({super.key, required this.message, this.onLongPress});

  final ChatMessage message;
  final VoidCallback? onLongPress;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final incoming = message.isIncoming;
    final maxWidth = MediaQuery.sizeOf(context).width * 0.78;

    final senderLabel = switch (message.sender) {
      MessageSender.customer => null,
      MessageSender.human => 'You',
      MessageSender.bot => 'AI bot',
    };

    return Align(
      alignment: incoming ? Alignment.centerLeft : Alignment.centerRight,
      child: ConstrainedBox(
        constraints: BoxConstraints(maxWidth: maxWidth),
        child: Material(
          color: incoming ? scheme.surface : scheme.primary.withValues(alpha: 0.18),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.only(
              topLeft: Radius.circular(incoming ? 4 : 16),
              topRight: Radius.circular(incoming ? 16 : 4),
              bottomLeft: const Radius.circular(16),
              bottomRight: const Radius.circular(16),
            ),
            side: BorderSide(color: incoming ? scheme.outline : scheme.primary.withValues(alpha: 0.35)),
          ),
          child: InkWell(
            customBorder: const RoundedRectangleBorder(borderRadius: BorderRadius.all(Radius.circular(16))),
            onLongPress: onLongPress,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(12, 8, 12, 6),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  if (senderLabel != null)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 2),
                      child: Text(
                        senderLabel,
                        style: TextStyle(
                          color: scheme.primary,
                          fontSize: 12,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                  if (message.hasMedia)
                    Padding(
                      padding: EdgeInsets.only(bottom: message.text.isEmpty ? 0 : 6),
                      child: MessageMedia(message: message),
                    ),
                  if (message.text.isNotEmpty)
                    Text(message.text, style: const TextStyle(fontSize: 15, height: 1.35)),
                  const SizedBox(height: 2),
                  Align(
                    alignment: Alignment.centerRight,
                    child: _Footer(message: message),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// "edited" label, the time, and (for messages we sent) the delivery tick.
class _Footer extends StatelessWidget {
  const _Footer({required this.message});

  final ChatMessage message;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final muted = TextStyle(color: scheme.onSurfaceVariant, fontSize: 11);

    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        if (message.isEdited) ...[
          Text('edited', style: muted.copyWith(fontStyle: FontStyle.italic)),
          const SizedBox(width: 6),
        ],
        Text(formatMessageTime(message.createdAt), style: muted),
        if (!message.isIncoming) ...[
          const SizedBox(width: 4),
          _DeliveryTick(state: message.deliveryState),
        ],
      ],
    );
  }
}

class _DeliveryTick extends StatelessWidget {
  const _DeliveryTick({required this.state});

  final DeliveryState state;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    // No receipt yet (or an older message from before receipts existed): show nothing rather than guess.
    return switch (state) {
      DeliveryState.none => const SizedBox.shrink(),
      DeliveryState.sent => Icon(Icons.check_rounded, size: 15, color: scheme.onSurfaceVariant),
      DeliveryState.delivered => Icon(Icons.done_all_rounded, size: 15, color: scheme.onSurfaceVariant),
      DeliveryState.read => const Icon(Icons.done_all_rounded, size: 15, color: Color(0xFF2E9BFF)),
      DeliveryState.failed => Icon(Icons.error_outline_rounded, size: 15, color: scheme.error),
    };
  }
}
