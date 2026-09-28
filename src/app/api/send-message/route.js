import { supabase } from '../../../../lib/supabase.js'
import { NextResponse } from 'next/server'

export async function POST(request) {
  let body

  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 })
  }

  const { conversationId, message: untrimmedMessage } = body ?? {}
  const message = typeof untrimmedMessage === 'string' ? untrimmedMessage.trim() : ''
  if (
    (typeof conversationId !== 'string' && typeof conversationId !== 'number') ||
    String(conversationId).trim() === '' ||
    message.length === 0 ||
    message.length > 4096
  ) {
    return NextResponse.json({ success: false, error: 'Invalid conversation or message' }, { status: 400 })
  }

  if (
    !process.env.WHATSAPP_PHONE_NUMBER_ID ||
    !process.env.WHATSAPP_ACCESS_TOKEN ||
    !process.env.WHATSAPP_GRAPH_API_URL
  ) {
    return NextResponse.json({ success: false, error: 'WhatsApp is not configured' }, { status: 503 })
  }

  try {
    const { data: conversation, error: conversationError } = await supabase
      .from('conversations')
      .select('phone_number')
      .eq('id', conversationId)
      .maybeSingle()

    if (conversationError) {
      return NextResponse.json({ success: false, error: 'Could not load conversation' }, { status: 500 })
    }
    if (!conversation?.phone_number) {
      return NextResponse.json({ success: false, error: 'Conversation not found' }, { status: 404 })
    }

    const graphApiBase = `${process.env.WHATSAPP_GRAPH_API_URL.replace(/\/+$/, '')}/`
    const whatsappEndpoint = new URL(
      `${encodeURIComponent(process.env.WHATSAPP_PHONE_NUMBER_ID)}/messages`,
      graphApiBase
    )
    const whatsappRes = await fetch(whatsappEndpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: conversation.phone_number,
        type: 'text',
        text: { body: message },
      }),
    })

    const whatsappData = await whatsappRes.json().catch(() => null)

    if (!whatsappRes.ok) {
      return NextResponse.json(
        { success: false, error: whatsappData?.error?.message || 'WhatsApp could not send the message' },
        { status: 502 }
      )
    }

    const [{ data: savedMessage, error: messageError }, { error: conversationUpdateError }] = await Promise.all([
      supabase.from('messages').insert({
        conversation_id: conversationId,
        sender: 'agent',
        message_text: message,
      }).select('*').single(),
      supabase
        .from('conversations')
        .update({ bot_active: false, last_message_at: new Date().toISOString() })
        .eq('id', conversationId),
    ])

    return NextResponse.json({
      success: true,
      message: savedMessage,
      warning: messageError || conversationUpdateError
        ? 'Message sent, but conversation history could not be fully updated.'
        : undefined,
    })
  } catch {
    return NextResponse.json({ success: false, error: 'Could not send the message' }, { status: 500 })
  }
}