import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// Hosts the proxy may fetch from. Anything else is rejected (prevents SSRF).
const ALLOWED_HOSTS = new Set([
  'graph.facebook.com',
  'graph.instagram.com',
  'lookaside.fbsbx.com',
  'res.cloudinary.com',
])
const ALLOWED_SUFFIXES = ['.fbcdn.net', '.cdninstagram.com', '.fbsbx.com', '.whatsapp.net']

// Only these hosts ever receive the WhatsApp bearer token.
const TOKEN_HOSTS = new Set(['graph.facebook.com', 'lookaside.fbsbx.com'])

// https://graph.facebook.com/v21.0/<mediaId>  (no file, only JSON metadata that holds the real download link)
const GRAPH_MEDIA_PATH = /^\/v\d+(?:\.\d+)?\/(\d{5,30})\/?$/

function parseAllowedUrl(raw) {
  let url
  try {
    url = new URL(raw)
  } catch {
    return null
  }
  if (url.protocol !== 'https:') return null
  const host = url.hostname.toLowerCase()
  const allowed = ALLOWED_HOSTS.has(host) || ALLOWED_SUFFIXES.some((suffix) => host.endsWith(suffix))
  return allowed ? url : null
}

/** Asks Meta for the current (short-lived) download link of a WhatsApp media id. */
async function resolveMediaId(mediaId, token) {
  const graphBase = (process.env.WHATSAPP_GRAPH_API_URL || 'https://graph.facebook.com/v26.0').replace(/\/$/, '')
  const metaRes = await fetch(`${graphBase}/${mediaId}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!metaRes.ok) return { error: new NextResponse('Could not retrieve media details from Meta', { status: metaRes.status }) }
  const data = await metaRes.json()
  const target = parseAllowedUrl(data.url)
  return target ? { target } : { error: new NextResponse('URL host is not allowed', { status: 400 }) }
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url)
    const rawUrl = searchParams.get('url')
    const mediaId = searchParams.get('mediaId')
    const token = process.env.WHATSAPP_ACCESS_TOKEN

    let target = null

    if (mediaId && !rawUrl) {
      if (!/^\d{5,30}$/.test(mediaId)) {
        return new NextResponse('Invalid mediaId', { status: 400 })
      }
      const resolved = await resolveMediaId(mediaId, token)
      if (resolved.error) return resolved.error
      target = resolved.target
    } else if (rawUrl) {
      target = parseAllowedUrl(rawUrl)
      // A Graph "media id" link is metadata, not the file: resolve it to the real download link.
      const idMatch = target && target.hostname.toLowerCase() === 'graph.facebook.com'
        ? GRAPH_MEDIA_PATH.exec(target.pathname)
        : null
      if (idMatch) {
        const resolved = await resolveMediaId(idMatch[1], token)
        if (resolved.error) return resolved.error
        target = resolved.target
      }
    } else {
      return new NextResponse('Missing url or mediaId parameter', { status: 400 })
    }

    if (!target) {
      return new NextResponse('URL host is not allowed', { status: 400 })
    }

    const headers = {}
    if (token && TOKEN_HOSTS.has(target.hostname.toLowerCase())) {
      headers.Authorization = `Bearer ${token}`
    }

    const mediaRes = await fetch(target.toString(), { headers })
    if (!mediaRes.ok) {
      // Meta download links expire after a few minutes; 410 tells the app the file is gone for good.
      // Meta's own 401/403 (bad or expired server token) must not look like an app-login failure, so they become 502.
      const expired = mediaRes.status === 400 || mediaRes.status === 404
      const authProblem = mediaRes.status === 401 || mediaRes.status === 403
      if (authProblem) console.error('[MEDIA-PROXY] provider refused the request; check WHATSAPP_ACCESS_TOKEN')
      return new NextResponse(
        expired ? 'This media link has expired' : 'Failed to fetch media from provider',
        { status: expired ? 410 : authProblem ? 502 : mediaRes.status }
      )
    }

    const contentType = mediaRes.headers.get('content-type') || 'application/octet-stream'
    const arrayBuffer = await mediaRes.arrayBuffer()

    return new NextResponse(arrayBuffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        // private: this route is behind login, so shared caches must not store it.
        'Cache-Control': 'private, max-age=86400',
        'Content-Length': String(arrayBuffer.byteLength),
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch (err) {
    console.error('[MEDIA-PROXY] error:', err)
    return new NextResponse('Internal error proxying media', { status: 500 })
  }
}
