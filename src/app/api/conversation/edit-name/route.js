import { NextResponse } from 'next/server'
import { supabase } from '../../../../../lib/supabase.js'
import { getFacebookSupabase } from '../../../../../lib/facebook-supabase.js'

export const dynamic = 'force-dynamic'

export async function POST(request) {
  try {
    const { psid, customName } = await request.json()

    if (!psid) {
      return NextResponse.json({ success: false, error: 'psid is required' }, { status: 400 })
    }

    const cleanCustomName = typeof customName === 'string' && customName.trim() ? customName.trim() : null
    const db = getFacebookSupabase() || supabase

    const candidatePsids = [psid]
    if (typeof psid === 'string') {
      if (psid.startsWith('wa_')) {
        candidatePsids.push(psid.replace(/^wa_/, ''))
      } else if (/^\d+$/.test(psid)) {
        candidatePsids.push(`wa_${psid}`)
      }
    }

    // 1. First attempt: update custom_name
    let result = await db
      .from('customers')
      .update({
        custom_name: cleanCustomName,
      })
      .in('psid', candidatePsids)
      .select('psid,name,custom_name')
      .maybeSingle()

    // 2. Seamless fallback: if custom_name is not in the database/schema cache yet,
    // update the name column directly so renaming works immediately without error!
    if (result.error && (
      String(result.error.message || '').includes('custom_name') ||
      String(result.error.message || '').includes('schema cache') ||
      result.error.code === '42703' ||
      result.error.code === 'PGRST204'
    )) {
      result = await db
        .from('customers')
        .update({
          name: cleanCustomName,
        })
        .in('psid', candidatePsids)
        .select('psid,name')
        .maybeSingle()
    }

    if (result.error) {
      return NextResponse.json({ success: false, error: result.error.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      psid,
      custom_name: cleanCustomName,
      name: result.data?.name || null,
      customer: result.data,
    })
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message || 'Update failed' }, { status: 500 })
  }
}
