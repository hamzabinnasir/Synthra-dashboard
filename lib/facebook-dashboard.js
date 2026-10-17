import { getFacebookSupabase } from './facebook-supabase.js'

export async function getGlobalBotSettings() {
  const defaults = {
    comment_bot_active: true,
    inbox_bot_active: true,
    instagram_comment_bot_active: true,
    instagram_inbox_bot_active: true,
    whatsapp_inbox_bot_active: true,
  }
  const facebookSupabase = getFacebookSupabase()
  if (!facebookSupabase) {
    return { settings: defaults, connected: false }
  }

  const { data, error } = await facebookSupabase
    .from('bot_settings')
    .select('comment_bot_active,inbox_bot_active,instagram_comment_bot_active,instagram_inbox_bot_active,whatsapp_inbox_bot_active')
    .eq('id', 1)
    .maybeSingle()

  if (error) {
    return { settings: defaults, connected: false, error: error.message }
  }
  return { settings: { ...defaults, ...data }, connected: true }
}