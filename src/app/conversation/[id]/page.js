import { supabase } from '../../../../lib/supabase.js'
import { notFound } from 'next/navigation'
import ConversationClient from './ConversationClient'

export const dynamic = 'force-dynamic'

export default async function ConversationPage({ params }) {
  const { id } = await params

  const { data: conversation, error: conversationError } = await supabase
    .from('conversations')
    .select('*')
    .eq('id', id)
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
    .eq('conversation_id', id)
    .order('created_at', { ascending: true })

  if (messagesError) {
    return <div role="alert" className="p-8 text-red-600">Unable to load conversation messages.</div>
  }

  return <ConversationClient conversation={conversation} initialMessages={messages || []} />
}