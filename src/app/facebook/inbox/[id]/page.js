import { notFound } from 'next/navigation'
import { getFacebookSupabase } from '../../../../../lib/facebook-supabase.js'
import { getGlobalBotSettings } from '../../../../../lib/facebook-dashboard.js'
import { enrichCustomerDisplayNames } from '../../../../../lib/enrich-customers.js'
import { DashboardHeader } from '../../../DashboardChrome'
import FacebookConversationClient from './FacebookConversationClient'

export const dynamic = 'force-dynamic'

export default async function FacebookConversationPage({ params }) {
  const { id } = await params
  const psid = decodeURIComponent(id)
  if (!/^\d+$/.test(psid)) notFound()

  const facebookSupabase = getFacebookSupabase()
  const settings = await getGlobalBotSettings()
  if (!facebookSupabase) {
    return <div className="app-shell flex min-h-screen flex-col"><DashboardHeader activeSection="facebook-inbox" initialSettings={settings} /><p role="alert" className="chat-error m-6 rounded-xl border p-4 text-sm">Facebook Supabase is not configured.</p></div>
  }

  let { data: customer, error: customerError } = await facebookSupabase.from('customers').select('psid,name,custom_name,username,profile_pic_url,bot_active').eq('psid', psid).maybeSingle()
  if (customerError && (String(customerError.message || '').includes('custom_name') || String(customerError.message || '').includes('username'))) {
    const fallback = await facebookSupabase.from('customers').select('psid,name,bot_active').eq('psid', psid).maybeSingle()
    customer = fallback.data
    customerError = fallback.error
  }
  if (customerError) return <p role="alert" className="p-8">Unable to load conversation.</p>
  if (!customer) notFound()
  customer = (await enrichCustomerDisplayNames(facebookSupabase, [customer], 'facebook'))[0]

  let { data: messages, error: messagesError } = await facebookSupabase
    .from('messages')
    .select('id,sender,text,created_at,media_url,media_type,media_mime_type,media_filename')
    .eq('psid', psid)
    .order('created_at', { ascending: true })

  if (messagesError && String(messagesError.message || '').includes('media_')) {
    const fallback = await facebookSupabase
      .from('messages')
      .select('id,sender,text,created_at')
      .eq('psid', psid)
      .order('created_at', { ascending: true })
    messages = fallback.data
    messagesError = fallback.error
  }

  return <FacebookConversationClient customer={customer} initialMessages={messages || []} messagesError={messagesError} globalBotActive={settings.settings.inbox_bot_active} />
}