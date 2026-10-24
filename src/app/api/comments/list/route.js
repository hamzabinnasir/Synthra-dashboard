import { NextResponse } from 'next/server'
import { supabase as defaultSupabase } from '../../../../../lib/supabase.js'
import { getFacebookSupabase } from '../../../../../lib/facebook-supabase.js'

// Same database the comments page reads from (falls back to the default project).
const supabase = getFacebookSupabase() || defaultSupabase

export const dynamic = 'force-dynamic'

const WATCH_LIMIT = 100 // must match the number of comments the comments pages load

// Lightweight id list the comments page polls as a safety net: if a Realtime DELETE event is ever
// missed (dropped connection, serverless restart), the page can still drop comments that are gone.
export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const platform = searchParams.get('platform')?.trim() || 'facebook'
  if (!['facebook', 'instagram'].includes(platform)) {
    return NextResponse.json({ success: false, error: 'Invalid platform' }, { status: 400 })
  }

  try {
    const { data, error } = await supabase
      .from('comments')
      .select('comment_id,created_at')
      .eq('platform', platform)
      .order('created_at', { ascending: false })
      .limit(WATCH_LIMIT)

    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })

    const rows = data || []
    return NextResponse.json({
      success: true,
      ids: rows.map((row) => row.comment_id),
      // When the window is full, older local comments fall outside it and must not be treated as deleted.
      oldest: rows.length >= WATCH_LIMIT ? rows[rows.length - 1].created_at : null,
    })
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}
