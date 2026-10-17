import { NextResponse } from 'next/server'
import { getFacebookSupabase } from '../../../../../../../lib/facebook-supabase.js'

export const dynamic = 'force-dynamic'

const PAGE = 1000
const MAX_FULL = 5000
const FULL_COLUMNS = 'id,sender,text,created_at,media_url,media_type,media_mime_type,media_filename'
const BASIC_COLUMNS = 'id,sender,text,created_at'

export async function GET(request, { params }) {
  const { id } = await params
  const psid = decodeURIComponent(id)
  if (!/^(?:ig_)?\d+$/.test(psid)) return NextResponse.json({ error: 'Invalid customer ID' }, { status: 400 })

  const url = new URL(request.url)
  const after = url.searchParams.get('after')
  const full = url.searchParams.get('full') === '1'
  if (after && Number.isNaN(Date.parse(after))) return NextResponse.json({ error: 'Invalid message cursor' }, { status: 400 })

  const supabase = getFacebookSupabase()
  if (!supabase) return NextResponse.json({ error: 'Facebook Supabase is not configured' }, { status: 503 })

  const build = (columns) => supabase.from('messages').select(columns).eq('psid', psid)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })

  // Runs a query and retries without media columns if the database doesn't have them yet.
  const run = async (apply) => {
    let result = await apply(build(FULL_COLUMNS))
    if (result.error && String(result.error.message || '').includes('media_')) {
      result = await apply(build(BASIC_COLUMNS))
    }
    return result
  }

  if (full) {
    const all = []
    for (let from = 0; from < MAX_FULL; from += PAGE) {
      const { data, error } = await run((q) => q.range(from, from + PAGE - 1))
      if (error) return NextResponse.json({ error: 'Could not load conversation messages' }, { status: 500 })
      all.push(...(data || []))
      if ((data || []).length < PAGE) break
    }
    return NextResponse.json({ messages: all }, { headers: { 'Cache-Control': 'no-store' } })
  }

  const { data: messages, error } = await run((q) => {
    let query = q.limit(200)
    if (after) query = query.gt('created_at', after)
    return query
  })
  if (error) return NextResponse.json({ error: 'Could not load new messages' }, { status: 500 })
  return NextResponse.json({ messages: messages || [] }, { headers: { 'Cache-Control': 'no-store' } })
}
