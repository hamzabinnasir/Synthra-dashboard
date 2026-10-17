import { supabase } from '../../../../lib/supabase.js'
import { notFound } from 'next/navigation'
import ConversationClient from './ConversationClient'

export const dynamic = 'force-dynamic'

export default async function ConversationPage({ params }) {
  const { id } = await params
  if (!/^wa_\d{5,20}$/.test(id)) notFound()

  const { data: conversation, error: conversationError } = await supabase
    .from('customers')
    .select('*')
    .eq('psid', id)
    .eq('platform', 'whatsapp')
    .maybeSingle()

  if (conversationError) {
    return <div role="alert" className="p-8 text-red-600">Unable to load conversation.</div>
  }
  if (!conversation) {
    notFound()
  }

  const { data: messages, error: messagesError } = await supabase
    .from('messages')
    .select('*')
    .eq('psid', id)
    .eq('platform', 'whatsapp')
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })
    .range(0, 4999)

  // A failed history query must not blank the page: the client loads the history itself
  // (with retries) and still shows live messages in the meantime.
  return (
    <ConversationClient
      conversation={conversation}
      initialMessages={messages || []}
      initialError={Boolean(messagesError)}
    />
  )
}
