/// The three channels the dashboard handles.
enum ChatPlatform {
  whatsapp('WhatsApp', 'whatsapp_inbox_bot_active', 4096),
  facebook('Facebook', 'inbox_bot_active', 1900),
  instagram('Instagram', 'instagram_inbox_bot_active', 1000);

  const ChatPlatform(this.label, this.globalBotSetting, this.messageLimit);

  final String label;

  /// Key in the dashboard's global `bot_settings` row that pauses the bot for the whole channel.
  final String globalBotSetting;

  /// Longest text message the channel accepts (enforced by the server too).
  final int messageLimit;

  /// Value used in `?platform=` query strings.
  String get apiName => name;

  /// Conversation ids: WhatsApp `wa_<digits>`, Instagram `ig_<id>`, Facebook = plain PSID.
  static ChatPlatform fromPsid(String psid, {String? platform}) {
    switch (platform) {
      case 'whatsapp':
        return ChatPlatform.whatsapp;
      case 'instagram':
        return ChatPlatform.instagram;
      case 'facebook':
        return ChatPlatform.facebook;
    }
    if (psid.startsWith('wa_')) return ChatPlatform.whatsapp;
    if (psid.startsWith('ig_')) return ChatPlatform.instagram;
    return ChatPlatform.facebook;
  }
}
