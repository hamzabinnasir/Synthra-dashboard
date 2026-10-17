import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { supabase } from '../../../../lib/supabase.js'
import { getCurrentAdmin } from '../../../../lib/auth.js'

export const dynamic = 'force-dynamic'

async function requireAdmin() {
  const admin = await getCurrentAdmin(await cookies())
  return admin
}

export async function GET(request) {
  try {
    if (!(await requireAdmin())) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10))
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '30', 10)))
    const platform = searchParams.get('platform')?.trim() || 'all'
    const type = searchParams.get('type')?.trim() || 'all'
    const unreadOnly = searchParams.get('unread_only') === 'true'

    const from = (page - 1) * limit
    const to = from + limit - 1

    let query = supabase
      .from('notifications')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to)

    if (platform && platform !== 'all') query = query.eq('platform', platform)
    if (type && type !== 'all') query = query.eq('type', type)
    if (unreadOnly) query = query.eq('is_read', false)

    let unreadQuery = supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('is_read', false)
    if (platform && platform !== 'all') unreadQuery = unreadQuery.eq('platform', platform)

    const [{ data: notifications, count: total, error }, { count: unreadCount }] =
      await Promise.all([query, unreadQuery])

    if (error) {
      if (error.code === 'PGRST205' || error.code === '42P01') {
        return NextResponse.json({
          success: true,
          notifications: [],
          total: 0,
          unread_count: 0,
          migration_needed: true,
        })
      }
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      notifications: notifications || [],
      total: total || 0,
      unread_count: unreadCount || 0,
      page,
      limit,
    })
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}

export async function PATCH(request) {
  try {
    if (!(await requireAdmin())) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }
    const { id, is_read = true } = await request.json()
    if (!id) {
      return NextResponse.json({ success: false, error: 'id is required' }, { status: 400 })
    }
    const { error } = await supabase.from('notifications').update({ is_read }).eq('id', id)
    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }
    return NextResponse.json({ success: true, id, is_read })
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}

export async function DELETE(request) {
  try {
    if (!(await requireAdmin())) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }
    const body = await request.json().catch(() => ({}))
    const { id, clear_all } = body || {}
    if (clear_all) {
      const { error } = await supabase.from('notifications').delete().neq('id', 0)
      if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })
      return NextResponse.json({ success: true, cleared: true })
    }
    if (!id) {
      return NextResponse.json({ success: false, error: 'id is required' }, { status: 400 })
    }
    const { error } = await supabase.from('notifications').delete().eq('id', id)
    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    return NextResponse.json({ success: true, id })
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}
