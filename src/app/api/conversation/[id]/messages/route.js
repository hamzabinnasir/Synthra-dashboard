import { supabase } from '../../../../../../lib/supabase.js'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET(request, { params }) {
  const { id } = await params
  if (!/^\d+$/.test(id) || !Number.isSafeInteger(Number(id))) {
    return NextResponse.json({ error: 'Invalid conversation ID' }, { status: 400 })
  }

  const after = new URL(request.url).searchParams.get('after')
  if (after && Number.isNaN(Date.parse(after))) {
    return NextResponse.json({ error: 'Invalid message cursor' }, { status: 400 })
  }

  let query = supabase
    .from('messages')
    .select('*')
    .eq('conversation_id', id)
    .order('created_at', { ascending: true })
    .limit(100)

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