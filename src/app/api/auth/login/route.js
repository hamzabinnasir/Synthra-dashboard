import { NextResponse } from 'next/server'
import { supabase } from '../../../../../lib/supabase.js'
import { verifyPassword, signJwt, SESSION_COOKIE_NAME } from '../../../../../lib/auth.js'

export const dynamic = 'force-dynamic'

export async function POST(request) {
  try {
    const body = await request.json()
    const { email, password } = body

    if (!email || !password) {
      return NextResponse.json({ success: false, error: 'Email and password are required' }, { status: 400 })
    }

    const cleanEmail = String(email).trim().toLowerCase()

    const { data: adminUser, error } = await supabase
      .from('admin_users')
      .select('*')
      .eq('email', cleanEmail)
      .maybeSingle()

    if (error) {
      console.error('[auth/login] admin_users lookup failed:', error.message)
      return NextResponse.json({ success: false, error: 'Login is temporarily unavailable' }, { status: 500 })
    }

    // Same message for unknown email and wrong password (no account enumeration).
    if (!adminUser || !verifyPassword(password, adminUser.password_hash)) {
      return NextResponse.json({ success: false, error: 'Invalid email or password' }, { status: 401 })
    }

    // The Flutter app cannot use the httpOnly cookie, so it opts in with this header and receives
    // the token in the JSON body (stored in secure storage on the device). Web clients never get
    // the token in JavaScript-readable form.
    const isMobile = request.headers.get('x-client-platform') === 'mobile'

    const token = signJwt(
      {
        userId: adminUser.id,
        email: adminUser.email,
        name: adminUser.name,
      },
      isMobile ? 30 * 86400 : undefined
    )

    const response = NextResponse.json({
      success: true,
      ...(isMobile ? { token } : {}),
      user: {
        id: adminUser.id,
        email: adminUser.email,
        name: adminUser.name,
        avatar_url: adminUser.avatar_url,
        cover_url: adminUser.cover_url,
      },
    })

    response.cookies.set({
      name: SESSION_COOKIE_NAME,
      value: token,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 7 * 86400,
    })

    return response
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message || 'Login failed' }, { status: 500 })
  }
}
