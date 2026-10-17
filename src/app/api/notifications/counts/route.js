import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { supabase } from '../../../../../lib/supabase.js'
import { getCurrentAdmin } from '../../../../../lib/auth.js'

export const dynamic = 'force-dynamic'

const SECTION_KEYS = ['whatsapp', 'facebook-inbox', 'facebook-comments', 'instagram-inbox', 'instagram-comments']

// Maps a notification to the header tab it belongs to.
function sectionFor(row) {
  if (row.platform === 'whatsapp') return 'whatsapp'
  if (row.platform !== 'facebook' && row.platform !== 'instagram') return null
  return `${row.platform}-${row.source_type === 'comment' ? 'comments' : 'inbox'}`
}

// GET /api/notifications/counts -> { counts: { [tabId]: unreadNumber }, total }
export async function GET() {
  try {
    if (!(await getCurrentAdmin(await cookies()))) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const { data, error } = await supabase
      .from('notifications')
      .select('platform,source_type')
      .eq('is_read', false)
      .limit(5000)

    const counts = Object.fromEntries(SECTION_KEYS.map((key) => [key, 0]))
    if (error) {
      if (error.code === 'PGRST205' || error.code === '42P01') {
        return NextResponse.json({ success: true, counts, total: 0, migration_needed: true })
      }
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    let total = 0
    for (const row of data || []) {
      const key = sectionFor(row)
      if (!key) continue
      counts[key] += 1
      total += 1
    }
    return NextResponse.json({ success: true, counts, total }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}
