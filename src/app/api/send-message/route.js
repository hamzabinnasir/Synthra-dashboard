import { supabase } from '../../../../lib/supabase.js'
import { NextResponse } from 'next/server'

export async function POST(request) {
  let body

  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 })
  }

  // Older dashboard bundles (still cached in some open tabs) posted { recipient, message }
  // instead of { psid, message }. Accept both so a stale tab keeps working.
  const { psid: rawPsid, recipient, message: untrimmedMessage } = body ?? {}
  const legacyDigits = typeof recipient === 'string' || typeof recipient === 'number'
    ? String(recipient).replace(/\D/g, '')
    : ''
  const psid = typeof rawPsid === 'string' && rawPsid
    ? rawPsid.trim()
    : legacyDigits
      ? `wa_${legacyDigits}`
      : ''
  const message = typeof untrimmedMessage === 'string' ? untrimmedMessage.trim() : ''

  if (!/^wa_\d{5,20}$/.test(psid)) {
    return NextResponse.json(
      { success: false, error: 'This conversation ID is not a valid WhatsApp number. Refresh the page and try again.' },
      { status: 400 }
    )
  }
  if (message.length === 0) {
    return NextResponse.json({ success: false, error: 'Type a message before sending.' }, { status: 400 })
  }
  if (message.length > 4096) {
    return NextResponse.json({ success: false, error: 'Message is too long (WhatsApp allows 4096 characters).' }, { status: 400 })
  }

  if (
    !process.env.WHATSAPP_PHONE_NUMBER_ID ||
    !process.env.WHATSAPP_ACCESS_TOKEN ||
    !process.env.WHATSAPP_GRAPH_API_URL
  ) {
    return NextResponse.json({ success: false, error: 'WhatsApp is not configured' }, { status: 503 })
  }

  try {
    const { data: customer, error: conversationError } = await supabase
      .from('customers')
      .select('psid,platform')
      .eq('psid', psid)
      .eq('platform', 'whatsapp')
      .maybeSingle()

    if (conversationError) {
      return NextResponse.json({ success: false, error: 'Could not load conversation' }, { status: 500 })
    }
    if (!customer?.psid) {
      return NextResponse.json({ success: false, error: 'Conversation not found' }, { status: 404 })
    }

    const phoneNumber = psid.replace(/^wa_/, '')
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
        to: phoneNumber,
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

    const sentAt = new Date().toISOString()
    const externalMessageId = whatsappData?.messages?.[0]?.id
    const { data: botSettings } = await supabase.from('bot_settings').select('auto_pause_on_human').eq('id', 1).maybeSingle()
    const shouldPause = Boolean(botSettings?.auto_pause_on_human)

    const [{ data: savedMessage, error: messageError }, { error: conversationUpdateError }] = await Promise.all([
      supabase.from('messages').insert({
        psid,
        platform: 'whatsapp',
        sender: 'human',
        text: message,
        mid: externalMessageId ? `wa_${externalMessageId}` : null,
        created_at: sentAt,
      }).select('*').single(),
      supabase
        .from('customers')
        .update({
          last_message_text: message,
          last_activity_at: sentAt,
          ...(shouldPause ? { bot_active: false } : {}),
        })
        .eq('psid', psid)
        .eq('platform', 'whatsapp'),
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