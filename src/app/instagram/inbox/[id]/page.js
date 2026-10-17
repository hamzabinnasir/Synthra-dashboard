import { notFound } from 'next/navigation'
import { getFacebookSupabase } from '../../../../../lib/facebook-supabase.js'
import { getGlobalBotSettings } from '../../../../../lib/facebook-dashboard.js'
import { enrichCustomerDisplayNames } from '../../../../../lib/enrich-customers.js'
import FacebookConversationClient from '../../../facebook/inbox/[id]/FacebookConversationClient'

export const dynamic = 'force-dynamic'

export default async function InstagramConversationPage({ params }) {
  const { id } = await params
  const psid = decodeURIComponent(id)
  if (!/^ig_\d+$/.test(psid)) notFound()

  const supabase = getFacebookSupabase()
  const settings = await getGlobalBotSettings()
  if (!supabase) {
    return <p role="alert" className="chat-error m-6 rounded-xl border p-4 text-sm">Social inbox Supabase is not configured.</p>
  }

  let { data: customer, error: customerError } = await supabase
    .from('customers')
    .select('psid,name,custom_name,username,profile_pic_url,platform,bot_active')
    .eq('psid', psid)
    .eq('platform', 'instagram')
    .maybeSingle()

  if (customerError && (String(customerError.message || '').includes('custom_name') || String(customerError.message || '').includes('username'))) {
    const fallback = await supabase
      .from('customers')
      .select('psid,name,platform,bot_active')
      .eq('psid', psid)
      .eq('platform', 'instagram')
      .maybeSingle()
    customer = fallback.data
    customerError = fallback.error
  }
  if (customerError) return <p role="alert" className="p-8">Unable to load conversation.</p>
  if (!customer) notFound()
  customer = (await enrichCustomerDisplayNames(supabase, [customer], 'instagram'))[0]

  let { data: messages, error: messagesError } = await supabase
    .from('messages')
    .select('id,sender,text,created_at,media_url,media_type,media_mime_type,media_filename')
    .eq('psid', psid)
    .order('created_at', { ascending: true })

  if (messagesError && String(messagesError.message || '').includes('media_')) {
    const fallback = await supabase
      .from('messages')
      .select('id,sender,text,created_at')
      .eq('psid', psid)
      .order('created_at', { ascending: true })
    messages = fallback.data
    messagesError = fallback.error
  }

  return (
    <FacebookConversationClient
      customer={customer}
      initialMessages={messages || []}
      messagesError={messagesError}
      globalBotActive={settings.settings.instagram_inbox_bot_active}
    />
  )
}
