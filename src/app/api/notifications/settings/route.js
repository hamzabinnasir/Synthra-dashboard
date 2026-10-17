import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { supabase } from '../../../../../lib/supabase.js'
import { getCurrentAdmin } from '../../../../../lib/auth.js'

export const dynamic = 'force-dynamic'

const DEFAULTS = {
  sound_enabled: true,
  desktop_enabled: false,
  dnd_enabled: false,
  popup_enabled: true,
  popup_seconds: 7,
  muted_platforms: { whatsapp: false, facebook: false, instagram: false },
  muted_types: { inbox: false, comment: false, media: false, human_request: false },
}

const POPUP_SECONDS_MIN = 3
const POPUP_SECONDS_MAX = 30

// Columns added by supabase/migrations/20261012_notification_popup_settings.sql.
// If that migration has not been applied yet we save everything else instead of failing.
const POPUP_COLUMNS = ['popup_enabled', 'popup_seconds']

function isMissingColumn(error) {
  const message = String(error?.message || '')
  return error?.code === 'PGRST204' || error?.code === '42703' || POPUP_COLUMNS.some((column) => message.includes(column))
}

function clampSeconds(value) {
  const number = Math.round(Number(value))
  if (!Number.isFinite(number)) return DEFAULTS.popup_seconds
  return Math.min(POPUP_SECONDS_MAX, Math.max(POPUP_SECONDS_MIN, number))
}

export async function GET() {
  const admin = await getCurrentAdmin(await cookies())
  if (!admin) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('notification_settings')
    .select('*')
    .eq('admin_id', admin.id)
    .maybeSingle()

  if (error && (error.code === 'PGRST205' || error.code === '42P01')) {
    return NextResponse.json({ success: true, settings: DEFAULTS, migration_needed: true })
  }
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, settings: data ? { ...DEFAULTS, ...data } : DEFAULTS })
}

export async function POST(request) {
  const admin = await getCurrentAdmin(await cookies())
  if (!admin) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const row = {
    admin_id: admin.id,
    sound_enabled: body.sound_enabled !== false,
    desktop_enabled: Boolean(body.desktop_enabled),
    dnd_enabled: Boolean(body.dnd_enabled),
    popup_enabled: body.popup_enabled !== false,
    popup_seconds: clampSeconds(body.popup_seconds ?? DEFAULTS.popup_seconds),
    muted_platforms: body.muted_platforms || DEFAULTS.muted_platforms,
    muted_types: body.muted_types || DEFAULTS.muted_types,
    updated_at: new Date().toISOString(),
  }

  let result = await supabase
    .from('notification_settings')
    .upsert(row, { onConflict: 'admin_id' })
    .select('*')
    .maybeSingle()

  let migrationNeeded = false
  if (result.error && isMissingColumn(result.error)) {
    migrationNeeded = true
    const legacyRow = { ...row }
    for (const column of POPUP_COLUMNS) delete legacyRow[column]
    result = await supabase
      .from('notification_settings')
      .upsert(legacyRow, { onConflict: 'admin_id' })
      .select('*')
      .maybeSingle()
  }

  if (result.error) return NextResponse.json({ success: false, error: result.error.message }, { status: 500 })
  return NextResponse.json({
    success: true,
    settings: { ...DEFAULTS, ...(result.data || row) },
    ...(migrationNeeded ? { migration_needed: true } : {}),
  })
}
