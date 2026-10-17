import { NextResponse } from 'next/server'
import nodemailer from 'nodemailer'
import { supabase } from '../../../../../lib/supabase.js'
import { generateRandomToken, hashResetToken } from '../../../../../lib/auth.js'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const RESET_TTL_MS = 60 * 60 * 1000 // 1 hour
const THROTTLE_MS = 60 * 1000 // 1 request per email per minute
const lastRequestAt = new Map()

// When mail is working the response is ALWAYS this same message. It must never contain the
// token or reveal whether the email exists, otherwise anyone could take over the account.
const GENERIC_RESPONSE = {
  success: true,
  message: 'If an account exists for that email, a password reset link has been sent. It can take a minute; also check your spam folder.',
}

// Returned (for every email, so it leaks nothing about accounts) when the server has no mail
// settings. Previously the page claimed "link sent" while nothing was sent at all.
const NOT_CONFIGURED_RESPONSE = {
  success: false,
  error: 'Email sending is not set up on this server yet. The administrator must add SMTP_HOST, SMTP_USER, SMTP_PASS and SMTP_FROM to the dashboard environment and restart it.',
}

function smtpConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS)
}

function createTransporter() {
  const host = String(process.env.SMTP_HOST || '').trim()
  const port = Number(process.env.SMTP_PORT || 587)
  // Port 465 = implicit TLS. Anything else (587 / 25) starts plain and upgrades with STARTTLS.
  const secure = process.env.SMTP_SECURE ? process.env.SMTP_SECURE === 'true' : port === 465
  let pass = String(process.env.SMTP_PASS || '')
  // Google shows app passwords in groups separated by spaces; the spaces are not part of it.
  if (/gmail\.com|googlemail\.com/i.test(host)) pass = pass.replace(/\s+/g, '')

  return nodemailer.createTransport({
    host,
    port,
    secure,
    requireTLS: !secure && port !== 25,
    auth: { user: String(process.env.SMTP_USER || '').trim(), pass },
    // Without timeouts a blocked port makes the request hang until the browser gives up.
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
  })
}

async function sendResetEmail(to, resetUrl) {
  const transporter = createTransporter()
  const from = process.env.SMTP_FROM || process.env.SMTP_USER
  return transporter.sendMail({
    from,
    to,
    subject: 'Reset your Synthra dashboard password',
    text: `Use this link to choose a new password. It expires in 1 hour.\n\n${resetUrl}\n\nIf you did not request this, you can ignore this email.`,
    html: `<p>Use the link below to choose a new password. It expires in 1 hour.</p><p><a href="${resetUrl}">Reset password</a></p><p>If you did not request this, you can ignore this email.</p>`,
  })
}

export async function POST(request) {
  try {
    const { email } = await request.json()
    if (!email) {
      return NextResponse.json({ success: false, error: 'Email is required' }, { status: 400 })
    }

    const cleanEmail = String(email).trim().toLowerCase()
    const configured = smtpConfigured()

    // Same answer for every address, so the page can tell the admin that mail is not set up
    // without exposing which accounts exist.
    const reply = () => (configured ? NextResponse.json(GENERIC_RESPONSE) : NextResponse.json(NOT_CONFIGURED_RESPONSE, { status: 503 }))

    const last = lastRequestAt.get(cleanEmail) || 0
    if (Date.now() - last < THROTTLE_MS) return reply()
    lastRequestAt.set(cleanEmail, Date.now())

    const { data: user, error: findError } = await supabase
      .from('admin_users')
      .select('id,email')
      .ilike('email', cleanEmail)
      .maybeSingle()

    if (findError) {
      console.error('[auth/forgot-password] lookup failed:', findError.message)
      return reply()
    }
    if (!user) {
      console.warn(`[auth/forgot-password] no admin account matches "${cleanEmail}"; nothing sent.`)
      return reply()
    }

    const token = generateRandomToken(32)
    const expiresAt = new Date(Date.now() + RESET_TTL_MS).toISOString()

    const { error: updateError } = await supabase
      .from('admin_users')
      .update({
        reset_token: hashResetToken(token), // only the hash is stored
        reset_token_expires_at: expiresAt,
        updated_at: new Date().toISOString(),
      })
      .eq('id', user.id)

    if (updateError) {
      console.error('[auth/forgot-password] could not store token:', updateError.message)
      return reply()
    }

    const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin).replace(/\/$/, '')
    const resetUrl = `${baseUrl}/reset-password?token=${token}`

    if (configured) {
      try {
        const info = await sendResetEmail(user.email, resetUrl)
        const accepted = (info.accepted || []).length > 0
        console.log(`[auth/forgot-password] SMTP ${accepted ? 'accepted' : 'did NOT accept'} the message for ${user.email}. Response: ${info.response || 'n/a'}`)
        if (!accepted) console.error('[auth/forgot-password] Rejected recipients:', info.rejected)
      } catch (mailErr) {
        // Kept generic for the browser (to avoid revealing the account); the real reason is here.
        console.error(`[auth/forgot-password] SMTP send FAILED (${mailErr.code || 'no code'}): ${mailErr.message}`)
        try {
          await supabase.from('activity_logs').insert({
            level: 'error',
            event: 'admin_password_reset_email_failed',
            detail: { email: cleanEmail, code: mailErr.code || null, error: String(mailErr.message || '').slice(0, 300) },
          })
        } catch {}
      }
    } else if (process.env.NODE_ENV !== 'production') {
      // Local development only: print the link to the SERVER terminal (never the HTTP response).
      console.log(`[auth/forgot-password] SMTP not configured. Dev reset link for ${user.email}: ${resetUrl}`)
    } else {
      console.error('[auth/forgot-password] SMTP is not configured; no reset email was sent.')
    }

    try {
      await supabase.from('activity_logs').insert({
        level: 'info',
        event: 'admin_password_reset_requested',
        detail: { email: cleanEmail, expires_at: expiresAt },
      })
    } catch {}

    return reply()
  } catch (err) {
    console.error('[auth/forgot-password] error:', err)
    return NextResponse.json({ success: false, error: 'Request failed' }, { status: 500 })
  }
}
