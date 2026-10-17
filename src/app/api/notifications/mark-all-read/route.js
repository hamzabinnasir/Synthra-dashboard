import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { supabase } from '../../../../../lib/supabase.js'
import { getCurrentAdmin } from '../../../../../lib/auth.js'

export const dynamic = 'force-dynamic'

// POST { platform?: 'all' | 'whatsapp' | 'facebook' | 'instagram', source?: 'comment' | 'inbox' }
// `source: 'comment'` marks only comment notifications; `source: 'inbox'` marks everything else
// (messages, media, human requests). Used by the header tabs to clear their own counter.
export async function POST(request) {
  try {
    if (!(await getCurrentAdmin(await cookies()))) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    let platform = 'all'
    let source = ''
    try {
      const body = await request.json()
      if (body?.platform) platform = body.platform
      if (body?.source) source = body.source
    } catch {}

    let query = supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('is_read', false)

    if (platform && platform !== 'all') {
      query = query.eq('platform', platform)
    }
    if (source === 'comment') query = query.eq('source_type', 'comment')
    if (source === 'inbox') query = query.neq('source_type', 'comment')

    const { error } = await query

    if (error) {
      if (error.code === 'PGRST205' || error.code === '42P01') {
        return NextResponse.json({ success: true, count: 0 })
      }
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}
