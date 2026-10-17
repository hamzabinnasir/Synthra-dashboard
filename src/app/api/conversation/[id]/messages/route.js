import { supabase } from '../../../../../../lib/supabase.js'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const PAGE = 1000
const MAX_FULL = 5000

export async function GET(request, { params }) {
  const { id } = await params
  if (!/^wa_\d{5,20}$/.test(id)) {
    return NextResponse.json({ error: 'Invalid conversation ID' }, { status: 400 })
  }

  const url = new URL(request.url)
  const after = url.searchParams.get('after')
  const full = url.searchParams.get('full') === '1'
  if (after && Number.isNaN(Date.parse(after))) {
    return NextResponse.json({ error: 'Invalid message cursor' }, { status: 400 })
  }

  const build = () => supabase
    .from('messages')
    .select('*')
    .eq('psid', id)
    .eq('platform', 'whatsapp')
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })

  // Full history: used to (re)load the whole thread, newest page last.
  if (full) {
    const all = []
    for (let from = 0; from < MAX_FULL; from += PAGE) {
      const { data, error } = await build().range(from, from + PAGE - 1)
      if (error) {
        return NextResponse.json({ error: 'Could not load conversation messages' }, { status: 500 })
      }
      all.push(...(data || []))
      if ((data || []).length < PAGE) break
    }
    return NextResponse.json({ messages: all }, { headers: { 'Cache-Control': 'no-store' } })
  }

  let query = build().limit(200)
  if (after) query = query.gt('created_at', after)

  const { data: messages, error } = await query
  if (error) {
    return NextResponse.json({ error: 'Could not load new messages' }, { status: 500 })
  }

  return NextResponse.json(
    { messages: messages || [] },
    { headers: { 'Cache-Control': 'no-store' } }
  )
}
