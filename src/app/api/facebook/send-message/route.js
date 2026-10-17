import { NextResponse } from 'next/server'
import { getFacebookSupabase } from '../../../../../lib/facebook-supabase.js'
import {
  facebookGraphRequest,
  getFacebookGraphConfig,
  getInstagramGraphConfig,
  instagramGraphRequest,
} from '../../../../../lib/facebook-graph.js'

export async function POST(request) {
  let body
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 })
  }

  const target = body?.target
  const id = typeof body?.id === 'string' ? body.id.trim() : ''
  const message = typeof body?.message === 'string' ? body.message.trim() : ''
  const mode = body?.mode || 'private'
  if (!['customer', 'comment'].includes(target) || !id || !message || message.length > 1900 || !['public', 'private'].includes(mode)) {
    return NextResponse.json({ success: false, error: 'Invalid recipient, reply mode, or message' }, { status: 400 })
  }

  const supabase = getFacebookSupabase()
  if (!supabase) {
    return NextResponse.json({ success: false, error: 'Social inbox database is not configured' }, { status: 503 })
  }

  let targetPlatform = 'facebook'
  try {
    if (target === 'customer') {
      const { data: customer, error: customerError } = await supabase
        .from('customers')
        .select('psid,last_customer_message_at')
        .eq('psid', id)
        .maybeSingle()
      if (customerError) throw new Error('Could not load selected conversation')
      if (!customer) return NextResponse.json({ success: false, error: 'Conversation not found' }, { status: 404 })
      targetPlatform = id.startsWith('ig_') ? 'instagram' : 'facebook'
      if (targetPlatform === 'instagram' && !getInstagramGraphConfig()) {
        return NextResponse.json({ success: false, error: 'IG_ACCESS_TOKEN is not configured' }, { status: 503 })
      }
      if (targetPlatform === 'facebook' && !getFacebookGraphConfig()) {
        return NextResponse.json({ success: false, error: 'Facebook Page API credentials are not configured' }, { status: 503 })
      }
      if (message.length > (targetPlatform === 'instagram' ? 1000 : 1900)) {
        return NextResponse.json({ success: false, error: `Message exceeds the ${targetPlatform === 'instagram' ? 'Instagram' : 'Facebook'} message limit` }, { status: 400 })
      }
      const recipientId = targetPlatform === 'instagram' && id.startsWith('ig_') ? id.slice(3) : id
      const lastMessageAt = customer.last_customer_message_at ? Date.parse(customer.last_customer_message_at) : Number.NaN
      const withinWindow = Number.isFinite(lastMessageAt) && Date.now() - lastMessageAt < 24 * 60 * 60 * 1000
      if (targetPlatform === 'instagram' && !withinWindow) {
        return NextResponse.json({ success: false, error: 'Instagram messages can only be sent within 24 hours of the customer’s last message.' }, { status: 400 })
      }
      const outboundMessage = {
        recipient: { id: recipientId },
        message: { text: message },
        ...(targetPlatform === 'facebook'
          ? {
            messaging_type: withinWindow ? 'RESPONSE' : 'MESSAGE_TAG',
            ...(!withinWindow ? { tag: 'HUMAN_AGENT' } : {}),
          }
          : {}),
      }
      const result = targetPlatform === 'instagram'
        ? await instagramGraphRequest('me/messages', { method: 'POST', body: outboundMessage })
        : await facebookGraphRequest(`${encodeURIComponent(getFacebookGraphConfig().pageId)}/messages`, { method: 'POST', body: outboundMessage })
      const saved = await persistHumanMessage(supabase, { psid: id, text: message, mid: result.message_id, platform: targetPlatform })
      if (saved.error) throw new Error('Message sent, but it could not be saved to the conversation history')
      await supabase.from('customers').update({ last_message_text: message, last_activity_at: new Date().toISOString() }).eq('psid', id)
      return NextResponse.json({ success: true, message: saved.message })
    }

    const { data: comment, error: commentError } = await supabase
      .from('comments')
      .select('comment_id,from_id,from_name,action')
      .eq('comment_id', id)
      .maybeSingle()
    if (commentError || !comment) return NextResponse.json({ success: false, error: 'Comment not found' }, { status: 404 })
    targetPlatform = id.startsWith('ig_') ? 'instagram' : 'facebook'
    if (targetPlatform === 'instagram' && !getInstagramGraphConfig()) {
      return NextResponse.json({ success: false, error: 'IG_ACCESS_TOKEN is not configured' }, { status: 503 })
    }
    if (targetPlatform === 'instagram' && mode === 'private' && !getFacebookGraphConfig()) {
      return NextResponse.json({ success: false, error: 'Facebook Page ID and Page access token are required for Instagram private replies.' }, { status: 503 })
    }
    if ((targetPlatform === 'facebook' || mode === 'private') && !getFacebookGraphConfig()) {
      return NextResponse.json({
        success: false,
        error: targetPlatform === 'instagram'
          ? 'Facebook Page ID and Page access token are required for Instagram private replies.'
          : 'Facebook Page API credentials are not configured',
      }, { status: 503 })
    }
    if (message.length > (targetPlatform === 'instagram' ? 1000 : 1900)) {
      return NextResponse.json({ success: false, error: `Reply exceeds the ${targetPlatform === 'instagram' ? 'Instagram' : 'Facebook'} message limit` }, { status: 400 })
    }
    const externalCommentId = targetPlatform === 'instagram' && id.startsWith('ig_') ? id.slice(3) : id

    if (mode === 'public') {
      const path = targetPlatform === 'instagram'
        ? `${encodeURIComponent(externalCommentId)}/replies`
        : `${encodeURIComponent(externalCommentId)}/comments`
      if (targetPlatform === 'instagram') {
        await instagramGraphRequest(path, { method: 'POST', query: { message } })
      } else {
        await facebookGraphRequest(path, { method: 'POST', body: { message } })
      }
      await supabase.from('activity_logs').insert({ event: 'comment_manual_public_reply', detail: { comment_id: id, platform: targetPlatform, message } })
      return NextResponse.json({ success: true })
    }

    const privateAlreadySent = [
      'private_reply_sent', 'private_reply_sent_public_notice',
      'private_reply_sent_notice_failed', 'private_reply_sent_manual',
      'private_reply_sent_manual_public_notice', 'private_reply_sent_manual_notice_failed',
    ].includes(comment.action)
    const { data: priorPrivateReplies, error: priorReplyError } = await supabase
      .from('activity_logs')
      .select('id')
      .eq('event', 'comment_manual_private_reply')
      .contains('detail', { comment_id: id })
      .limit(1)
    if (priorReplyError) throw new Error('Could not check whether a private reply was already sent')
    if (privateAlreadySent || priorPrivateReplies?.length) {
      return NextResponse.json({
        success: false,
        privateReplySent: true,
        error: `${targetPlatform === 'instagram' ? 'Instagram' : 'Facebook'} allows only one private reply to this comment, and it has already been sent.`,
      }, { status: 409 })
    }

    const result = await facebookGraphRequest(`${encodeURIComponent(getFacebookGraphConfig().pageId)}/messages`, {
      method: 'POST',
      body: { recipient: { comment_id: externalCommentId }, message: { text: message } },
    })
    const { error: sentStateError } = await supabase
      .from('comments')
      .update({ action: 'private_reply_sent_manual' })
      .eq('comment_id', id)
    if (sentStateError) console.error('Could not save sent private reply state', { id, error: sentStateError.message })
    const { error: logError } = await supabase.from('activity_logs').insert({
      event: 'comment_manual_private_reply',
      detail: { comment_id: id, from_id: comment.from_id, platform: targetPlatform, message },
    })
    if (logError) console.error('Could not log sent private reply', { id, error: logError.message })

    let publicNoticeSent = false
    let warning
    try {
      const notice = targetPlatform === 'instagram'
        ? await instagramGraphRequest(`${encodeURIComponent(externalCommentId)}/replies`, {
          method: 'POST',
          query: { message: "We've sent you a private message. Please check your inbox." },
        })
        : await facebookGraphRequest(`${encodeURIComponent(externalCommentId)}/comments`, {
          method: 'POST',
          body: { message: "We've sent you a private message. Please check your inbox." },
        })
      publicNoticeSent = Boolean(notice)
      const { error: updateError } = await supabase.from('comments').update({ action: 'private_reply_sent_manual_public_notice' }).eq('comment_id', id)
      if (updateError) console.error('Could not save private reply notice state', { id, error: updateError.message })
    } catch (noticeError) {
      warning = 'The private inbox reply was sent, but its public reminder could not be posted.'
      const { error: updateError } = await supabase.from('comments').update({ action: 'private_reply_sent_manual_notice_failed' }).eq('comment_id', id)
      if (updateError) console.error('Could not save private reply state', { id, error: updateError.message })
      console.error('Private reply sent but public reminder failed', { id, error: noticeError.message })
    }

    if (comment.from_id) {
      const { error: upsertError } = await supabase.from('customers').upsert(
        {
          psid: comment.from_id,
          name: comment.from_name || undefined,
          ...(targetPlatform === 'instagram' ? { platform: targetPlatform } : {}),
        },
        { onConflict: 'psid', ignoreDuplicates: true },
      )
      if (upsertError) throw new Error('Message sent, but the inbox customer could not be saved')
      const saved = await persistHumanMessage(supabase, {
        psid: comment.from_id,
        text: message,
        mid: result.message_id,
        comment_id: id,
        platform: targetPlatform,
      })
      if (saved.error) throw new Error('Message sent, but it could not be saved to the inbox history')
    }
    return NextResponse.json({ success: true, privateReplySent: true, publicNoticeSent, ...(warning ? { warning } : {}) })
  } catch (error) {
    const message = error.message || ''
    if (target === 'comment' && /\bcode 100(?:\/33)?\b/i.test(message) && /does not exist|cannot be loaded|not found/i.test(message)) {
      const { error: updateError } = await supabase.from('comments').update({ action: `deleted_from_${targetPlatform}` }).eq('comment_id', id)
      if (updateError) console.error('Could not mark unavailable comment', { id, platform: targetPlatform, error: updateError.message })
      return NextResponse.json({
        success: false,
        deleted: true,
        error: `This comment is no longer available on ${targetPlatform} and has been removed from the dashboard.`,
      }, { status: 410 })
    }
    if (target === 'comment' && mode === 'private' && /\bcode 10900\b/i.test(message)) {
      const { error: updateError } = await supabase.from('comments').update({ action: 'private_reply_sent_manual' }).eq('comment_id', id)
      if (updateError) console.error('Could not save already-sent private reply state', { id, error: updateError.message })
      const { error: logError } = await supabase.from('activity_logs').insert({
        event: 'comment_manual_private_reply',
        detail: { comment_id: id, from_id: null, already_replied: true },
      })
      if (logError) console.error('Could not log already-sent private reply state', { id, error: logError.message })
      return NextResponse.json({
        success: false,
        privateReplySent: true,
        error: `${targetPlatform === 'instagram' ? 'Instagram' : 'Facebook'} has already sent a private reply for this comment. You can still post a public reply.`,
      }, { status: 409 })
    }
    return NextResponse.json({ success: false, error: error.message || `Could not send ${targetPlatform} message` }, { status: 502 })
  }
}

async function persistHumanMessage(supabase, { psid, text, mid, comment_id, platform }) {
  const row = {
    psid, sender: 'human', text,
    ...(platform === 'instagram' ? { platform } : {}),
    ...(mid ? { mid: platform === 'instagram' ? `ig_${mid}` : mid } : {}),
    ...(comment_id ? { comment_id } : {}),
  }
  let result = await supabase.from('messages').insert(row).select('id,sender,text,created_at').single()
  if (result.error && comment_id && ['PGRST204', '42703'].includes(result.error.code) && result.error.message.includes('comment_id')) {
    result = await supabase.from('messages').insert({
      psid, sender: 'human', text,
      ...(platform === 'instagram' ? { platform } : {}),
      ...(mid ? { mid: platform === 'instagram' ? `ig_${mid}` : mid } : {}),
    }).select('id,sender,text,created_at').single()
  }
  return { message: result.data, error: result.error }
}