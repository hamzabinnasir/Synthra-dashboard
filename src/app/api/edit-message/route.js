import { NextResponse } from 'next/server'
import { supabase } from '../../../../lib/supabase.js'
import { getFacebookSupabase } from '../../../../lib/facebook-supabase.js'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const MAX_TEXT_LENGTH = 4000

// Same rule as delete-message: Facebook/Instagram messages live in their own Supabase project only when
// FACEBOOK_SUPABASE_URL differs from the default project.
function messagesDb(platform) {
  if (platform !== 'facebook' && platform !== 'instagram') return supabase
  const client = getFacebookSupabase()
  if (!client) return supabase
  const sameProject = process.env.FACEBOOK_SUPABASE_URL === process.env.NEXT_PUBLIC_SUPABASE_URL
  return sameProject ? supabase : client
}

/**
 * Edit the text of a message WE sent (bot or agent), on every channel.
 *
 * WhatsApp, Messenger and Instagram do not let a business change a message that was already delivered, so this
 * only changes the copy stored in the dashboard (the customer still sees the original). The mobile app labels
 * such messages "edited". Customer messages can never be edited.
 */
export async function POST(request) {
  let body
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 })
  }

  const messageId = Number(body?.messageId)
  if (!Number.isInteger(messageId) || messageId <= 0) {
    return NextResponse.json({ success: false, error: 'Invalid message ID' }, { status: 400 })
  }
  const psid = typeof body?.psid === 'string' ? body.psid.trim() : ''
  if (!psid) {
    return NextResponse.json({ success: false, error: 'psid is required' }, { status: 400 })
  }
  const platform = typeof body?.platform === 'string' ? body.platform.trim().toLowerCase() : ''
  const text = typeof body?.text === 'string' ? body.text.trim() : ''
  if (!text) {
    return NextResponse.json({ success: false, error: 'The message cannot be empty' }, { status: 400 })
  }
  if (text.length > MAX_TEXT_LENGTH) {
    return NextResponse.json({ success: false, error: `The message is too long (max ${MAX_TEXT_LENGTH} characters)` }, { status: 400 })
  }

  const db = messagesDb(platform)

  try {
    const { data: rows, error: findError } = await db
      .from('messages')
      .select('id, sender, text')
      .eq('id', messageId)
      .eq('psid', psid)
      .limit(1)
    if (findError) {
      console.error('[edit-message] lookup error:', findError)
      return NextResponse.json({ success: false, error: findError.message || 'Could not find message' }, { status: 500 })
    }
    const row = rows?.[0]
    if (!row) {
      return NextResponse.json({ success: false, error: 'Message not found' }, { status: 404 })
    }
    if (row.sender === 'customer') {
      return NextResponse.json({ success: false, error: 'Customer messages cannot be edited' }, { status: 403 })
    }
    if ((row.text || '') === text) {
      return NextResponse.json({ success: true, unchanged: true })
    }

    const editedAt = new Date().toISOString()
    const { data: updated, error } = await db
      .from('messages')
      .update({ text, edited_at: editedAt })
      .eq('id', messageId)
      .eq('psid', psid)
      .select('id')
    if (error) {
      console.error('[edit-message] update error:', error)
      const missingColumn = /edited_at/i.test(error.message || '')
      return NextResponse.json(
        {
          success: false,
          error: missingColumn
            ? 'The database is missing the edited_at column. Run supabase/migrations/20261029_message_status_edit.sql.'
            : error.message || 'Could not edit message',
        },
        { status: 500 },
      )
    }
    if (!updated?.length) {
      return NextResponse.json({ success: false, error: 'Message not found' }, { status: 404 })
    }

    // Keep the inbox preview in sync when the edited message is the latest one of the conversation.
    await db.from('customers').update({ last_message_text: text }).eq('psid', psid).eq('last_message_text', row.text || '')

    return NextResponse.json({ success: true, edited_at: editedAt })
  } catch (err) {
    console.error('[edit-message] Exception:', err)
    return NextResponse.json({ success: false, error: err.message || 'Internal server error' }, { status: 500 })
  }
}
