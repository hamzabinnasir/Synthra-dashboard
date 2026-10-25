import crypto from 'node:crypto'
import { NextResponse } from 'next/server'
import { supabase } from '../../../../../lib/supabase.js'
import { fcmConfigured, sendPush } from '../../../../../lib/fcm.js'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// Called by a Supabase Database Webhook on INSERT into public.notifications (see CLAUDE.md for the setup).
// Not protected by the admin session: it is protected by the shared secret in PUSH_WEBHOOK_SECRET,
// sent by Supabase in the `x-webhook-secret` header.

function secretMatches(received) {
  const expected = process.env.PUSH_WEBHOOK_SECRET || ''
  if (!expected || !received) return false
  const a = Buffer.from(received)
  const b = Buffer.from(expected)
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

function titleFor(row) {
  const name = row.customer_name || row.customer_username || 'New contact'
  if (row.type === 'human_request') return `${name} needs a human`
  if (row.source_type === 'comment' || row.type === 'comment') return `New comment from ${name}`
  return name
}

function bodyFor(row) {
  const preview = String(row.message_preview || '').trim()
  if (preview) return preview.length > 140 ? `${preview.slice(0, 137)}...` : preview
  if (row.type === 'media') return 'Sent a file'
  return 'New activity'
}

function isMuted(settings, row) {
  if (!settings) return false
  if (settings.dnd_enabled) return true
  if (settings.muted_platforms?.[row.platform]) return true
  if (settings.muted_types?.[row.type]) return true
  return false
}

export async function POST(request) {
  if (!secretMatches(request.headers.get('x-webhook-secret'))) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }
  if (!fcmConfigured()) {
    return NextResponse.json({ success: false, error: 'FCM is not configured on the server' }, { status: 503 })
  }

  let payload
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON' }, { status: 400 })
  }

  // Supabase webhook shape: { type: 'INSERT', table, record, old_record }
  const row = payload?.record
  if (payload?.type !== 'INSERT' || !row) {
    return NextResponse.json({ success: true, skipped: 'not an insert' })
  }
  if (row.is_read) return NextResponse.json({ success: true, skipped: 'already read' })

  const { data: devices, error } = await supabase.from('device_tokens').select('token, admin_user_id')
  if (error) {
    console.error('[push] could not load device tokens:', error.message)
    return NextResponse.json({ success: false, error: 'Could not load devices' }, { status: 500 })
  }
  if (!devices?.length) return NextResponse.json({ success: true, sent: 0 })

  // Each admin's own do-not-disturb / mute settings decide whether their phones are notified.
  const adminIds = [...new Set(devices.map((device) => device.admin_user_id))]
  const { data: settingsRows } = await supabase.from('notification_settings').select('*').in('admin_id', adminIds)
  const settingsByAdmin = new Map((settingsRows || []).map((item) => [String(item.admin_id), item]))

  const message = {
    title: titleFor(row),
    body: bodyFor(row),
    data: {
      notification_id: row.id,
      platform: row.platform,
      type: row.type,
      source_type: row.source_type,
      target_id: row.target_id,
    },
  }

  let sent = 0
  const deadTokens = []
  await Promise.all(
    devices
      .filter((device) => !isMuted(settingsByAdmin.get(String(device.admin_user_id)), row))
      .map(async (device) => {
        const result = await sendPush(device.token, message)
        if (result.ok) sent += 1
        else {
          console.warn('[push] send failed:', result.error)
          if (result.invalidToken) deadTokens.push(device.token)
        }
      })
  )

  if (deadTokens.length) await supabase.from('device_tokens').delete().in('token', deadTokens)
  return NextResponse.json({ success: true, sent, removed: deadTokens.length })
}
