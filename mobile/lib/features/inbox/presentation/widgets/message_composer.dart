import 'package:flutter/material.dart';

import 'common.dart';

/// Text box + send button at the bottom of a chat. The text is only cleared once the server accepted it,
/// so a failed send never loses what the agent typed.
class MessageComposer extends StatefulWidget {
  const MessageComposer({
    super.key,
    required this.onSend,
    required this.maxLength,
    required this.hint,
    this.onAttach,
  });

  /// Sends the trimmed text. Throw to keep the draft and show the error.
  final Future<void> Function(String text) onSend;
  final int maxLength;
  final String hint;

  /// Shows a paperclip button when set (only WhatsApp chats can send media).
  final VoidCallback? onAttach;

  @override
  State<MessageComposer> createState() => _MessageComposerState();
}

class _MessageComposerState extends State<MessageComposer> {
  final _controller = TextEditingController();
  bool _sending = false;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    final text = _controller.text.trim();
    if (text.isEmpty || _sending) return;
    setState(() => _sending = true);
    try {
      await widget.onSend(text);
      if (mounted) _controller.clear();
    } catch (error) {
      if (mounted) showError(context, error);
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Material(
      color: scheme.surface,
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(4, 8, 8, 8),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              if (widget.onAttach != null)
                IconButton(
                  tooltip: 'Attach',
                  onPressed: _sending ? null : widget.onAttach,
                  icon: const Icon(Icons.attach_file_rounded),
                )
              else
                const SizedBox(width: 8),
              Expanded(
                child: TextField(
                  controller: _controller,
                  minLines: 1,
                  maxLines: 5,
                  maxLength: widget.maxLength,
                  textCapitalization: TextCapitalization.sentences,
                  keyboardType: TextInputType.multiline,
                  decoration: InputDecoration(
                    hintText: widget.hint,
                    counterText: '',
                    isDense: true,
                    contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                  ),
                ),
              ),
              const SizedBox(width: 8),
              ValueListenableBuilder<TextEditingValue>(
                valueListenable: _controller,
                builder: (_, value, _) {
                  final canSend = value.text.trim().isNotEmpty && !_sending;
                  return IconButton.filled(
                    tooltip: 'Send',
                    onPressed: canSend ? _send : null,
                    icon: _sending
                        ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2))
                        : const Icon(Icons.send_rounded),
                  );
                },
              ),
            ],
          ),
        ),
      ),
    );
  }
}
