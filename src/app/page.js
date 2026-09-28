import { supabase } from '../../lib/supabase.js'
import ConversationList from './ConversationList'
import Image from 'next/image'
import ThemeToggle from './ThemeToggle'

export const dynamic = 'force-dynamic'

export default async function Home() {
  const { data: conversations, error } = await supabase
    .from('conversations')
    .select('*')
    .order('last_message_at', { ascending: false })

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
      <header className="app-header border-b">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
          <Image src="/synthra-mark.svg" alt="Synthra" width={42} height={42} priority className="h-10 w-10" />
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.18em]">Synthra</p>
            <p className="brand-accent text-[10px] font-semibold uppercase">AI INBOX</p>
          </div>
          </div>
          <ThemeToggle />
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="theme-text text-2xl font-semibold">Conversations</h1>
            <p className="theme-muted mt-1 text-sm">Your WhatsApp conversations with Synthra AI</p>
          </div>
          <span className="conversation-count rounded-full px-3 py-1.5 text-xs font-medium">
            {conversations.length} {conversations.length === 1 ? 'conversation' : 'conversations'}
          </span>
        </div>

        {conversations.length === 0 ? (
          <div className="theme-muted border-y py-12 text-center text-sm">
            No conversations yet.
          </div>
        ) : (
          <ConversationList conversations={conversations} />
        )}
      </main>
    </div>
  )
}