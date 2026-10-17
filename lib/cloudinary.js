import crypto from 'node:crypto'

const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/jpg'])
const MAX_IMAGE_BYTES = 5 * 1024 * 1024

// Only assets inside these folders may be removed when a chat message is deleted.
// This protects shared/static assets (profile photos, branding, etc.).
const DELETABLE_PREFIX = 'synthra/'

function creds() {
  return {
    cloud: process.env.CLOUDINARY_CLOUD_NAME || '',
    key: process.env.CLOUDINARY_API_KEY || '',
    secret: process.env.CLOUDINARY_API_SECRET || '',
  }
}

export function cloudinaryConfigured() {
  const { cloud, key, secret } = creds()
  return Boolean(cloud && key && secret)
}

function sign(params, secret) {
  const body = Object.keys(params)
    .filter((key) => params[key] != null)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join('&')
  return crypto.createHash('sha1').update(`${body}${secret}`).digest('hex')
}

export function parseImageDataUrl(dataUrl) {
  if (!dataUrl || typeof dataUrl !== 'string') return null
  if (dataUrl.startsWith('http://') || dataUrl.startsWith('https://')) {
    return { kind: 'url', url: dataUrl }
  }
  const match = dataUrl.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+);base64,(.+)$/)
  if (!match) {
    throw new Error('Image has an invalid data format.')
  }
  const mimeType = match[1].toLowerCase()
  if (!ALLOWED_IMAGE_TYPES.has(mimeType)) {
    throw new Error('Images must be JPEG, PNG, or WebP.')
  }
  const buffer = Buffer.from(match[2], 'base64')
  if (buffer.length > MAX_IMAGE_BYTES) {
    throw new Error('Image size exceeds the 5MB limit.')
  }
  return { kind: 'buffer', buffer, mimeType }
}

export async function uploadImageBuffer(buffer, { folder, mimeType, filename, publicId } = {}) {
  const { cloud, key, secret } = creds()
  if (!cloud || !key || !secret) {
    throw new Error('Cloudinary is not configured.')
  }
  if (!buffer?.length) throw new Error('No file data to upload.')
  if (buffer.length > MAX_IMAGE_BYTES) throw new Error('Image size exceeds the 5MB limit.')
  if (mimeType && !ALLOWED_IMAGE_TYPES.has(mimeType.toLowerCase())) {
    throw new Error('Images must be JPEG, PNG, or WebP.')
  }

  const timestamp = Math.floor(Date.now() / 1000)
  const signParams = { folder, timestamp }
  if (publicId) signParams.public_id = publicId
  const form = new FormData()
  form.set('api_key', key)
  form.set('timestamp', String(timestamp))
  form.set('signature', sign(signParams, secret))
  form.set('folder', folder)
  if (publicId) form.set('public_id', publicId)
  const blob = new Blob([Uint8Array.from(buffer)], { type: mimeType || 'application/octet-stream' })
  form.set('file', blob, filename || 'upload')

  const response = await fetch(`https://api.cloudinary.com/v1_1/${cloud}/image/upload`, {
    method: 'POST',
    body: form,
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(payload?.error?.message || `Cloudinary upload failed (${response.status})`)
  }
  return {
    url: payload.secure_url || payload.url,
    public_id: payload.public_id,
  }
}

/**
 * Deletes one asset. Returns true when the asset is gone afterwards
 * (deleted now, or Cloudinary says it was already missing).
 * Cloudinary answers HTTP 200 with { result: "not found" } for a wrong resource type,
 * so the body is checked instead of trusting the status code alone.
 */
export async function destroyCloudinaryAsset(publicId, resourceType = 'image') {
  const { cloud, key, secret } = creds()
  if (!cloud || !key || !secret || !publicId) return false
  const timestamp = Math.floor(Date.now() / 1000)
  const form = new FormData()
  form.set('public_id', publicId)
  form.set('api_key', key)
  form.set('timestamp', String(timestamp))
  form.set('invalidate', 'true')
  form.set('signature', sign({ public_id: publicId, timestamp, invalidate: 'true' }, secret))
  try {
    const response = await fetch(`https://api.cloudinary.com/v1_1/${cloud}/${resourceType}/destroy`, {
      method: 'POST',
      body: form,
    })
    if (!response.ok) return false
    const payload = await response.json().catch(() => ({}))
    return payload?.result === 'ok' || payload?.result === 'not found'
  } catch {
    return false
  }
}

function resourceTypeFromMedia(row) {
  const kind = String(row?.media_type || '').toLowerCase()
  const mime = String(row?.media_mime_type || '').toLowerCase()
  if (kind === 'image' || kind === 'sticker' || mime.startsWith('image/')) return 'image'
  if (kind === 'video' || kind === 'audio' || kind === 'voice' || mime.startsWith('video/') || mime.startsWith('audio/')) return 'video'
  return 'raw'
}

/**
 * Works out which Cloudinary asset (if any) a message row points to.
 * Uses media_public_id when present, otherwise derives it from the res.cloudinary.com URL
 * (WhatsApp inbound rows historically have no public id). Returns null for anything that
 * is not a deletable Cloudinary asset of this account.
 */
export function resolveCloudinaryAsset(row) {
  const { cloud } = creds()
  const url = typeof row?.media_url === 'string' ? row.media_url : ''
  const match = url.match(/^https?:\/\/res\.cloudinary\.com\/([^/]+)\/(image|video|raw)\/upload\/([^?#]+)/)

  let resourceType = null
  let publicId = null

  if (match) {
    if (cloud && match[1] !== cloud) return null
    resourceType = match[2]
    const versioned = match[3].match(/(?:^|\/)v\d+\/(.+)$/)
    let path = versioned ? versioned[1] : match[3]
    try { path = decodeURIComponent(path) } catch {}
    // raw public ids keep their extension; image/video ids do not
    publicId = resourceType === 'raw' ? path : path.replace(/\.[A-Za-z0-9]{1,5}$/, '')
  }

  // Only trust a stored public id when the URL is also a Cloudinary URL of ours,
  // so a stray value can never point deletion at something unrelated.
  if (match && row?.media_public_id) publicId = row.media_public_id

  if (!publicId || !resourceType) return null
  if (!publicId.startsWith(DELETABLE_PREFIX)) return null
  return { publicId, resourceType: resourceType || resourceTypeFromMedia(row) }
}

/**
 * Loads the media-bearing messages for a set of values of `column` ('id' or 'psid')
 * BEFORE they are deleted, so their Cloudinary files can be removed afterwards.
 */
export async function fetchMediaRows(db, column, values) {
  const list = (Array.isArray(values) ? values : [values]).filter((v) => v !== null && v !== undefined)
  if (!db || list.length === 0) return []

  const FULL = 'id,media_url,media_public_id,media_type,media_mime_type'
  const BASIC = 'id,media_url,media_type,media_mime_type'
  const rows = []

  for (let i = 0; i < list.length; i += 100) {
    const chunk = list.slice(i, i + 100)
    for (let from = 0; ; from += 1000) {
      let result = await db.from('messages').select(FULL).in(column, chunk).not('media_url', 'is', null).range(from, from + 999)
      if (result.error && String(result.error.message || '').includes('media_public_id')) {
        result = await db.from('messages').select(BASIC).in(column, chunk).not('media_url', 'is', null).range(from, from + 999)
      }
      if (result.error) {
        console.warn('[media-cleanup] could not load media rows:', result.error.message)
        break
      }
      rows.push(...(result.data || []))
      if ((result.data || []).length < 1000) break
    }
  }
  return rows
}

/**
 * Removes the Cloudinary files behind the given message rows. Never throws:
 * a Cloudinary problem must not turn a successful database delete into an error.
 * Returns { deleted, failed, skipped } counts.
 */
export async function destroyMediaAssets(rows, concurrency = 5) {
  const summary = { deleted: 0, failed: 0, skipped: 0 }
  if (!rows?.length) return summary
  if (!cloudinaryConfigured()) {
    summary.skipped = rows.length
    return summary
  }

  const unique = new Map()
  for (const row of rows) {
    const asset = resolveCloudinaryAsset(row)
    if (!asset) { summary.skipped += 1; continue }
    unique.set(`${asset.resourceType}:${asset.publicId}`, asset)
  }

  const queue = [...unique.values()]
  const worker = async () => {
    while (queue.length) {
      const asset = queue.shift()
      const ok = await destroyCloudinaryAsset(asset.publicId, asset.resourceType)
      if (ok) summary.deleted += 1
      else {
        summary.failed += 1
        console.warn('[media-cleanup] Cloudinary delete failed:', asset.resourceType, asset.publicId)
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, worker))
  return summary
}
