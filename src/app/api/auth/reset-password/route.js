import { NextResponse } from 'next/server'
import { supabase } from '../../../../../lib/supabase.js'
import { hashPassword, hashResetToken } from '../../../../../lib/auth.js'

export const dynamic = 'force-dynamic'

export async function POST(request) {
  try {
    const { token, newPassword } = await request.json()

    if (!token || !newPassword) {
      return NextResponse.json({ success: false, error: 'Token and new password are required' }, { status: 400 })
    }

    if (String(newPassword).length < 8) {
      return NextResponse.json({ success: false, error: 'Password must be at least 8 characters long' }, { status: 400 })
    }

    const { data: user, error } = await supabase
      .from('admin_users')
      .select('id,email,reset_token_expires_at')
      .eq('reset_token', hashResetToken(token))
      .maybeSingle()

    if (error || !user) {
      return NextResponse.json({ success: false, error: 'Invalid or expired password reset link' }, { status: 400 })
    }

    const expiresMs = user.reset_token_expires_at ? Date.parse(user.reset_token_expires_at) : 0
    if (!expiresMs || expiresMs < Date.now()) {
      return NextResponse.json(
        { success: false, error: 'This reset link has expired. Please request a new one.' },
        { status: 400 }
      )
    }

    const { error: updateError } = await supabase
      .from('admin_users')
      .update({
        password_hash: hashPassword(newPassword),
        reset_token: null, // single use
        reset_token_expires_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', user.id)

    if (updateError) throw updateError

    try {
      await supabase.from('activity_logs').insert({
        level: 'info',
        event: 'admin_password_reset_completed',
        detail: { email: user.email },
      })
    } catch {}

    return NextResponse.json({ success: true, message: 'Password has been successfully updated.' })
  } catch (err) {
    console.error('[auth/reset-password] error:', err)
    return NextResponse.json({ success: false, error: 'Reset failed' }, { status: 500 })
  }
}
