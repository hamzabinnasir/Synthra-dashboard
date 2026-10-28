import { NextResponse } from 'next/server'
import { supabase } from '../../../../../lib/supabase.js'

export const dynamic = 'force-dynamic'

// `profile_pic_url` MUST be part of this list: the dashboard re-syncs every few seconds and
// replaces its rows with this response, so a missing column makes profile photos vanish.
// `unread_count` drives the per-conversation message badge (migration 20261013_unread_counters.sql).
const COLUMN_TIERS = [
  { columns: 'psid,name,custom_name,username,profile_pic_url,platform,bot_active,last_message_text,last_activity_at,created_at,unread_count', marker: null },
  { columns: 'psid,name,custom_name,username,profile_pic_url,platform,bot_active,last_message_text,last_activity_at,created_at', marker: 'unread_count' },
  { columns: 'psid,name,custom_name,username,platform,bot_active,last_message_text,last_activity_at,created_at', marker: 'profile_pic' },
  { columns: 'psid,name,platform,bot_active,last_message_text,last_activity_at,created_at', marker: 'custom_name|username' },
]

function applyPlatform(query, platform) {
  if (platform === 'whatsapp') {
    return query.or('platform.eq.whatsapp,psid.ilike.wa_%')
  }
  if (platform === 'instagram') {
    return query.or('platform.eq.instagram,psid.ilike.ig_%')
  }
  if (platform === 'facebook') {
    return query.or('platform.eq.facebook,platform.is.null')
  }
  if (platform) {
    return query.eq('platform', platform)
  }
  return query
}

function buildQuery(columns, platform) {
  // `count: 'exact'` returns the real number of conversations of this channel, not just the 100 rows sent.
  return applyPlatform(supabase.from('customers').select(columns, { count: 'exact' }), platform)
    .order('last_activity_at', { ascending: false, nullsFirst: false })
    .limit(100)
}

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const platform = searchParams.get('platform')?.trim() || 'whatsapp'

  try {
    // Try the richest column set first and step down only when a column does not exist yet.
    let result = await buildQuery(COLUMN_TIERS[0].columns, platform)
    for (let tier = 1; result.error && tier < COLUMN_TIERS.length; tier += 1) {
      const message = String(result.error.message || '')
      const missing = COLUMN_TIERS[tier].marker.split('|').some((name) => message.includes(name))
      if (!missing && tier > 1) break
      result = await buildQuery(COLUMN_TIERS[tier].columns, platform)
    }

    const { data: customers, error, count } = result

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    const rows = customers || []
    const filtered = rows.filter((c) => {
      const psid = String(c.psid || '')
      if (platform === 'facebook' && (psid.startsWith('wa_') || psid.startsWith('ig_'))) {
        return false
      }
      return true
    })

    // Facebook rows with a wa_/ig_ id are dropped above; take them off the exact count too.
    const dropped = rows.length - filtered.length
    const total = Math.max(filtered.length, (typeof count === 'number' ? count : filtered.length) - dropped)

    return NextResponse.json({ success: true, customers: filtered, total })
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}
