import { getFacebookSupabase } from '../../../../lib/facebook-supabase.js'
import { getGlobalBotSettings } from '../../../../lib/facebook-dashboard.js'
import { enrichCustomerDisplayNames } from '../../../../lib/enrich-customers.js'
import { DashboardHeader, FacebookInboxList } from '../../DashboardChrome'

export const dynamic = 'force-dynamic'

const FULL_COLUMNS = 'psid,name,custom_name,username,profile_pic_url,platform,bot_active,last_message_text,last_activity_at'
const BASIC_COLUMNS = 'psid,name,platform,bot_active,last_message_text,last_activity_at'

export default async function InstagramInboxPage() {
  const supabase = getFacebookSupabase()
  const settings = await getGlobalBotSettings()
  const load = (columns) => supabase
    .from('customers')
    .select(columns)
    .eq('platform', 'instagram')
    .order('last_activity_at', { ascending: false })

  // unread_count drives the per-conversation message badge (migration 20261013_unread_counters.sql).
  let queryResult = supabase ? await load(`${FULL_COLUMNS},unread_count`) : { data: null, error: true }
  const missing = (name) => String(queryResult.error?.message || '').includes(name)

  if (supabase && queryResult.error && missing('unread_count')) {
    queryResult = await load(FULL_COLUMNS)
  }
  if (supabase && queryResult.error && (missing('custom_name') || missing('username') || missing('profile_pic'))) {
    queryResult = await load(BASIC_COLUMNS)
  }
  const { data, error } = queryResult
  const customers = error ? [] : await enrichCustomerDisplayNames(supabase, data || [], 'instagram')

  return (
    <div className="app-shell flex min-h-screen flex-col">
      <DashboardHeader activeSection="instagram-inbox" initialSettings={settings} />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="theme-text text-2xl font-semibold">Instagram Inbox</h1>
            <p className="theme-muted mt-1 text-sm">Instagram conversations and bot controls</p>
          </div>
        </div>
        {error ? (
          <p role="alert" className="chat-error rounded-xl border p-4 text-sm">
            {!supabase
              ? 'Social inbox Supabase is not configured. Add its server-only URL and service key to the dashboard environment.'
              : error.code === '42703'
                ? 'Instagram support is not enabled in the database yet. Run supabase/migrations/20261004_instagram_support.sql in the Supabase SQL Editor, then reload this page.'
                : `Could not load Instagram inbox: ${error.message || 'unknown database error'}`}
          </p>
        ) : (
          <FacebookInboxList customers={customers} globalBotActive={settings.settings.instagram_inbox_bot_active} platform="instagram" />
        )}
      </main>
    </div>
  )
}
