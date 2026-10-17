import { supabase } from '../../lib/supabase.js'
import ConversationList from './ConversationList'
import { DashboardHeader } from './DashboardChrome'
import { getGlobalBotSettings } from '../../lib/facebook-dashboard.js'

export const dynamic = 'force-dynamic'

export default async function Home() {
  const [{ data: conversations, error }, settings] = await Promise.all([
    supabase.from('customers').select('*').eq('platform', 'whatsapp').order('last_activity_at', { ascending: false }),
    getGlobalBotSettings(),
  ])

  if (error) {
    return (
      <main className="app-shell mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
        <p role="alert" className="chat-error rounded-xl border p-4 text-sm">
          Unable to load conversations. Please try again later.
        </p>
      </main>
    )
  }

  return (
    <div className="app-shell">
      <DashboardHeader activeSection="whatsapp" initialSettings={settings} />

      <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="theme-text text-2xl font-semibold">Conversations</h1>
            <p className="theme-muted mt-1 text-sm">Your WhatsApp conversations with Synthra AI</p>
          </div>
        </div>

        <ConversationList conversations={conversations || []} />
      </main>
    </div>
  )
}