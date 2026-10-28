import { NextResponse } from 'next/server'
import { supabase } from '../../../../../lib/supabase.js'
import { getCurrentAdmin } from '../../../../../lib/auth.js'
import { fcmConfigured, fcmProblem, sendPush } from '../../../../../lib/fcm.js'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// POST /api/push/test  (signed-in admin only; protected by the normal session / Bearer middleware)
// Sends a real push to every phone registered by the caller and reports which link of the push chain works:
//   server key  ->  registered phones  ->  Firebase delivery
// The Supabase "notifications INSERT" webhook (supabase/push-webhook.sql) cannot be probed from here, so the
// response also says whether the shared secret it needs is configured.
export async function POST(request) {
  const admin = await getCurrentAdmin(request)
  if (!admin) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })

  const checks = {
    fcm_configured: fcmConfigured(),
    webhook_secret_configured: Boolean(process.env.PUSH_WEBHOOK_SECRET),
    app_url: process.env.NEXT_PUBLIC_APP_URL || null,
    // Which deployment actually answered this request (tells you if the phone talks to the wrong server).
    server: {
      vercel_env: process.env.VERCEL_ENV || 'not-on-vercel',
      branch: process.env.VERCEL_GIT_COMMIT_REF || null,
      commit: (process.env.VERCEL_GIT_COMMIT_SHA || '').slice(0, 7) || null,
      host: request.headers.get('host') || null,
    },
    registered_devices: 0,
    delivered: 0,
    failed: 0,
    errors: [],
  }

  if (!checks.fcm_configured) {
    const where = `${checks.server.vercel_env}${checks.server.branch ? `/${checks.server.branch}` : ''} @ ${checks.server.host || 'unknown host'}`
    return NextResponse.json({
      success: false,
      error: `The server has no usable Firebase key (answered by ${where}): ${fcmProblem()}.`,
      checks,
    })
  }

  const { data: devices, error } = await supabase
    .from('device_tokens')
    .select('token, platform')
    .eq('admin_user_id', String(admin.id))

  if (error) {
    return NextResponse.json({
      success: false,
      error: 'Could not read device_tokens. Run supabase/migrations/20261026_device_tokens.sql in the Supabase SQL editor.',
      checks,
    })
  }

  checks.registered_devices = devices?.length || 0
  if (!checks.registered_devices) {
    return NextResponse.json({
      success: false,
      error: 'No phone is registered for your account. Allow notifications in the app, sign out and sign in again.',
      checks,
    })
  }

  const dead = []
  await Promise.all(
    devices.map(async (device) => {
      const result = await sendPush(device.token, {
        title: 'Synthra test alert',
        body: 'Push notifications are working on this phone.',
        data: { source_type: 'test', target_id: '' },
      })
      if (result.ok) {
        checks.delivered += 1
      } else {
        checks.failed += 1
        checks.errors.push(result.error)
        if (result.invalidToken) dead.push(device.token)
      }
    })
  )

  if (dead.length) await supabase.from('device_tokens').delete().in('token', dead)

  const success = checks.delivered > 0
  return NextResponse.json({
    success,
    ...(success
      ? {}
      : { error: `Firebase rejected the push: ${checks.errors[0] || 'unknown error'}` }),
    checks,
  })
}
