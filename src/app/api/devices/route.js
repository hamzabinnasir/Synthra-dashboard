import { NextResponse } from 'next/server'
import { supabase } from '../../../../lib/supabase.js'
import { getCurrentAdmin } from '../../../../lib/auth.js'

export const dynamic = 'force-dynamic'

const MAX_TOKEN_LENGTH = 4096

async function readBody(request) {
  try {
    return (await request.json()) ?? {}
  } catch {
    return null
  }
}

// POST /api/devices  { token, platform: 'android' | 'ios' }
// Registers (or re-assigns) a Firebase Cloud Messaging token for the signed-in admin.
export async function POST(request) {
  const admin = await getCurrentAdmin(request)
  if (!admin) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })

  const body = await readBody(request)
  const token = typeof body?.token === 'string' ? body.token.trim() : ''
  const platform = body?.platform === 'ios' ? 'ios' : 'android'
  if (!token || token.length > MAX_TOKEN_LENGTH) {
    return NextResponse.json({ success: false, error: 'A valid device token is required' }, { status: 400 })
  }

  const { error } = await supabase
    .from('device_tokens')
    .upsert(
      { admin_user_id: String(admin.id), token, platform, updated_at: new Date().toISOString() },
      { onConflict: 'token' }
    )

  if (error) {
    return NextResponse.json({ success: false, error: 'Could not register this device' }, { status: 500 })
  }
  return NextResponse.json({ success: true })
}

// DELETE /api/devices  { token }  (call on logout so the phone stops receiving alerts)
export async function DELETE(request) {
  const admin = await getCurrentAdmin(request)
  if (!admin) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })

  const body = await readBody(request)
  const token = typeof body?.token === 'string' ? body.token.trim() : ''
  if (!token) {
    return NextResponse.json({ success: false, error: 'A device token is required' }, { status: 400 })
  }

  const { error } = await supabase
    .from('device_tokens')
    .delete()
    .eq('token', token)
    .eq('admin_user_id', String(admin.id))

  if (error) {
    return NextResponse.json({ success: false, error: 'Could not remove this device' }, { status: 500 })
  }
  return NextResponse.json({ success: true })
}
