import { NextResponse } from 'next/server'
import { supabase as defaultSupabase } from '../../../../../lib/supabase.js'
import { getFacebookSupabase } from '../../../../../lib/facebook-supabase.js'
import {
  facebookGraphRequest,
  getFacebookGraphConfig,
  getInstagramGraphConfig,
  instagramGraphRequest,
} from '../../../../../lib/facebook-graph.js'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const WATCH_LIMIT = 100 // same window the comments pages load
const BATCH_SIZE = 20 // comments verified against Meta per call (keeps Graph usage low)
const CONFIRM_DELAY_MS = 1500
const MIN_INTERVAL_MS = 6000 // a second tab/poll inside this window just reuses the last answer

// Per-process memory. On serverless it can reset between calls; the rotation then simply restarts.
const lastChecked = new Map() // comment_id -> epoch ms
const lastRun = new Map() // platform -> { at, result }

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * True ONLY for Meta's explicit "object does not exist" answer (code 100, subcode 33).
 * Network failures, rate limits, expired tokens and permission errors are NEVER treated as deleted,
 * so a bad token can never wipe the dashboard.
 */
function isGone(error) {
  const message = String(error?.message || '').toLowerCase()
  return (
    message.includes('(code 100/33)') ||
    message.includes('subcode 33') ||
    message.includes('does not exist')
  )
}

async function existsOnPlatform(platform, commentId) {
  const external = platform === 'instagram' && commentId.startsWith('ig_') ? commentId.slice(3) : commentId
  if (platform === 'instagram') {
    await instagramGraphRequest(encodeURIComponent(external), { query: { fields: 'id' } })
  } else {
    await facebookGraphRequest(encodeURIComponent(external), { query: { fields: 'id' } })
  }
}

async function tokenHealthy(platform) {
  try {
    if (platform === 'instagram') {
      await instagramGraphRequest('me', { query: { fields: 'id' } })
    } else {
      await facebookGraphRequest('me', { query: { fields: 'id' } })
    }
    return true
  } catch {
    return false
  }
}

export async function POST(request) {
  let platform = 'facebook'
  try {
    const body = await request.json()
    if (body?.platform) platform = String(body.platform)
  } catch {
    // default platform
  }
  if (!['facebook', 'instagram'].includes(platform)) {
    return NextResponse.json({ success: false, error: 'Invalid platform' }, { status: 400 })
  }

  const configured = platform === 'instagram' ? getInstagramGraphConfig() : getFacebookGraphConfig()
  if (!configured) {
    return NextResponse.json({ success: true, skipped: 'token_not_configured', removed: [] })
  }

  const recent = lastRun.get(platform)
  if (recent && Date.now() - recent.at < MIN_INTERVAL_MS) {
    return NextResponse.json({ ...recent.result, cached: true })
  }

  const db = getFacebookSupabase() || defaultSupabase

  try {
    const { data, error } = await db
      .from('comments')
      .select('comment_id,created_at')
      .eq('platform', platform)
      .order('created_at', { ascending: false })
      .limit(WATCH_LIMIT)
    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })

    // Least recently verified first, so every comment is re-checked in turn.
    const batch = (data || [])
      .sort((a, b) => (lastChecked.get(a.comment_id) || 0) - (lastChecked.get(b.comment_id) || 0))
      .slice(0, BATCH_SIZE)

    const result = { success: true, checked: 0, removed: [], errors: 0 }
    if (!batch.length) {
      lastRun.set(platform, { at: Date.now(), result })
      return NextResponse.json(result)
    }

    if (!(await tokenHealthy(platform))) {
      const skipped = { success: true, skipped: 'token_check_failed', removed: [] }
      lastRun.set(platform, { at: Date.now(), result: skipped })
      return NextResponse.json(skipped)
    }

    const suspects = []
    for (const row of batch) {
      lastChecked.set(row.comment_id, Date.now())
      result.checked += 1
      try {
        await existsOnPlatform(platform, row.comment_id)
      } catch (err) {
        if (isGone(err)) suspects.push(row.comment_id)
        else result.errors += 1
      }
      if (result.errors >= 5) break // never burn the rate limit
    }

    if (suspects.length) {
      // Confirm every miss a second time before anything is deleted.
      await sleep(CONFIRM_DELAY_MS)
      for (const commentId of suspects) {
        let stillGone = false
        try {
          await existsOnPlatform(platform, commentId)
        } catch (err) {
          stillGone = isGone(err)
        }
        if (!stillGone) continue

        // Same RPC the backend uses: deletes the rows, writes the tombstone and audit entry.
        // The resulting Supabase Realtime DELETE event is what removes the card from every open dashboard.
        const { error: rpcError } = await db.rpc('delete_comment_records', {
          p_comment_id: commentId,
          p_platform: platform,
          p_actor_id: 'system',
          p_action_type: 'comment_removed_on_platform',
        })
        if (rpcError) {
          result.errors += 1
          continue
        }
        lastChecked.delete(commentId)
        result.removed.push(commentId)
      }
    }

    lastRun.set(platform, { at: Date.now(), result })
    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message || 'Sync failed' }, { status: 500 })
  }
}
