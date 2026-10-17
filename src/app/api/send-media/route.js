import { supabase } from '../../../../lib/supabase.js'
import { destroyCloudinaryAsset } from '../../../../lib/cloudinary.js'
import { classifyWhatsAppMedia, uploadWhatsAppMedia } from '../../../../lib/whatsapp-media.js'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const KIND_LABEL = { image: '[Image]', video: '[Video]', audio: '[Audio]', document: '[Document]' }

function fail(error, status) {
  return NextResponse.json({ success: false, error }, { status })
}

export async function POST(request) {
  let form
  try {
    form = await request.formData()
  } catch {
    return fail('Invalid upload. Please choose the file again.', 400)
  }

  const psid = String(form.get('psid') || '').trim()
  const caption = String(form.get('caption') || '').trim().slice(0, 1024)
  const file = form.get('file')

  if (!/^wa_\d{5,20}$/.test(psid)) {
    return fail('This conversation ID is not a valid WhatsApp number. Refresh the page and try again.', 400)
  }
  if (!file || typeof file === 'string' || typeof file.arrayBuffer !== 'function') {
    return fail('Choose a file to send.', 400)
  }

  const media = classifyWhatsAppMedia(file.type)
  if (!media) {
    return fail(
      'This file type is not supported by WhatsApp. Use JPG/PNG, MP4, MP3/AAC/OGG audio, or PDF/Office documents.',
      415
    )
  }
  if (file.size > media.maxBytes) {
    return fail(`File is too large. The limit for this type is ${Math.round(media.maxBytes / (1024 * 1024))} MB.`, 413)
  }

  if (
    !process.env.WHATSAPP_PHONE_NUMBER_ID ||
    !process.env.WHATSAPP_ACCESS_TOKEN ||
    !process.env.WHATSAPP_GRAPH_API_URL
  ) {
    return fail('WhatsApp is not configured', 503)
  }

  const { data: customer, error: customerError } = await supabase
    .from('customers')
    .select('psid,platform')
    .eq('psid', psid)
    .eq('platform', 'whatsapp')
    .maybeSingle()
  if (customerError) return fail('Could not load conversation', 500)
  if (!customer?.psid) return fail('Conversation not found', 404)

  // 1) Upload to Cloudinary so we own a permanent public URL.
  let uploaded
  try {
    const buffer = Buffer.from(await file.arrayBuffer())
    uploaded = await uploadWhatsAppMedia(buffer, {
      kind: media.kind,
      mimeType: media.mimeType,
      filename: file.name,
    })
  } catch (error) {
    return fail(error?.message || 'Could not upload the file', 502)
  }

  // 2) Send the Cloudinary URL to the customer through the WhatsApp Cloud API.
  const filename = file.name || 'attachment'
  const mediaPayload = { link: uploaded.url }
  if (media.kind !== 'audio' && caption) mediaPayload.caption = caption
  if (media.kind === 'document') mediaPayload.filename = filename

  let externalMessageId = null
  try {
    const graphApiBase = `${process.env.WHATSAPP_GRAPH_API_URL.replace(/\/+$/, '')}/`
    const endpoint = new URL(`${encodeURIComponent(process.env.WHATSAPP_PHONE_NUMBER_ID)}/messages`, graphApiBase)
    const whatsappRes = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: psid.replace(/^wa_/, ''),
        type: media.kind,
        [media.kind]: mediaPayload,
      }),
    })
    const whatsappData = await whatsappRes.json().catch(() => null)
    if (!whatsappRes.ok) {
      // Don't leave an orphaned file in Cloudinary if WhatsApp refused it.
      void destroyCloudinaryAsset(uploaded.publicId, uploaded.resourceType).catch(() => {})
      return fail(whatsappData?.error?.message || 'WhatsApp could not send the file', 502)
    }
    externalMessageId = whatsappData?.messages?.[0]?.id || null
  } catch {
    void destroyCloudinaryAsset(uploaded.publicId, uploaded.resourceType).catch(() => {})
    return fail('Could not reach WhatsApp. Please try again.', 502)
  }

  // 3) Save it so it appears in the dashboard chat immediately (realtime INSERT).
  const sentAt = new Date().toISOString()
  const { data: botSettings } = await supabase
    .from('bot_settings')
    .select('auto_pause_on_human')
    .eq('id', 1)
    .maybeSingle()
  const shouldPause = Boolean(botSettings?.auto_pause_on_human)
  const preview = caption || KIND_LABEL[media.kind]

  const [{ data: savedMessage, error: messageError }, { error: customerUpdateError }] = await Promise.all([
    supabase
      .from('messages')
      .insert({
        psid,
        platform: 'whatsapp',
        sender: 'human',
        text: caption,
        mid: externalMessageId ? `wa_${externalMessageId}` : null,
        created_at: sentAt,
        media_url: uploaded.url,
        media_type: media.kind,
        media_mime_type: media.mimeType,
        media_filename: filename,
        media_public_id: uploaded.publicId,
        media_status: 'uploaded',
      })
      .select('*')
      .single(),
    supabase
      .from('customers')
      .update({
        last_message_text: preview,
        last_activity_at: sentAt,
        ...(shouldPause ? { bot_active: false } : {}),
      })
      .eq('psid', psid)
      .eq('platform', 'whatsapp'),
  ])

  return NextResponse.json({
    success: true,
    message: savedMessage,
    warning: messageError || customerUpdateError
      ? 'File sent, but conversation history could not be fully updated.'
      : undefined,
  })
}
