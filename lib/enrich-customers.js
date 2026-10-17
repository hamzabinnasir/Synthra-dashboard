import { looksLikeCustomerId } from './conversation-helpers.js'
import { fetchSocialProfile } from './facebook-graph.js'
import { cloudinaryConfigured, uploadImageBuffer } from './cloudinary.js'

// Meta refuses some profile reads (privacy settings, no recent interaction). Remember
// those failures for a while so every page load does not re-hit the Graph API.
const RETRY_AFTER_MS = 10 * 60 * 1000
const MAX_LOOKUPS_PER_CALL = 25
const lastAttempt = new Map()

function needsEnrichment(customer, platform) {
  if (platform !== 'facebook' && platform !== 'instagram') return false
  const missingName = !customer.custom_name && looksLikeCustomerId(customer.name, customer.psid)
  const missingUsername = platform === 'instagram' && !customer.username
  const missingPhoto = !customer.profile_pic_url
  if (!(missingName || missingUsername || missingPhoto)) return false
  const previous = lastAttempt.get(customer.psid)
  return !previous || Date.now() - previous > RETRY_AFTER_MS
}

// Facebook / Instagram CDN photo links are signed and expire within hours or days, which is why a
// picture can show up and then turn into initials. Copy it to Cloudinary (permanent URL) when that
// is configured; otherwise fall back to the raw link so behaviour is unchanged.
async function makePhotoDurable(url, platform, psid) {
  if (!url || !cloudinaryConfigured()) return { url, publicId: null }
  try {
    const response = await fetch(url, { cache: 'no-store' })
    if (!response.ok) throw new Error(`Photo download failed (${response.status})`)
    const mimeType = (response.headers.get('content-type') || 'image/jpeg').split(';')[0].trim().toLowerCase()
    const buffer = Buffer.from(await response.arrayBuffer())
    const uploaded = await uploadImageBuffer(buffer, {
      folder: `synthra/profiles/${platform}`,
      mimeType: mimeType.startsWith('image/') ? mimeType : 'image/jpeg',
      filename: `${psid}.jpg`,
    })
    return { url: uploaded.url || url, publicId: uploaded.public_id || null }
  } catch {
    return { url, publicId: null }
  }
}

export async function enrichCustomerDisplayNames(supabase, customers, platform) {
  if (!supabase || !customers?.length) return customers || []

  const missing = customers.filter((customer) => needsEnrichment(customer, platform))
  if (!missing.length) return customers

  const updates = new Map()
  await Promise.all(
    missing.slice(0, MAX_LOOKUPS_PER_CALL).map(async (customer) => {
      lastAttempt.set(customer.psid, Date.now())
      try {
        const profile = await fetchSocialProfile(customer.psid, platform)
        if (!profile) return
        const patch = {}
        if (profile.name && looksLikeCustomerId(customer.name, customer.psid)) patch.name = profile.name
        if (profile.username && !customer.username) patch.username = profile.username
        if (profile.profile_pic_url && !customer.profile_pic_url) {
          const photo = await makePhotoDurable(profile.profile_pic_url, platform, customer.psid)
          patch.profile_pic_url = photo.url
          if (photo.publicId) patch.profile_pic_public_id = photo.publicId
        }
        if (Object.keys(patch).length) {
          updates.set(customer.psid, patch)
          let { error } = await supabase.from('customers').update(patch).eq('psid', customer.psid)
          // `profile_pic_public_id` may not exist on older databases: retry without it.
          if (error && 'profile_pic_public_id' in patch) {
            const { profile_pic_public_id: _unused, ...withoutPublicId } = patch
            ;({ error } = await supabase.from('customers').update(withoutPublicId).eq('psid', customer.psid))
          }
        }
      } catch {
        // Graph permissions may deny user profile reads; keep the stored row.
      }
    })
  )

  if (!updates.size) return customers
  return customers.map((customer) =>
    updates.has(customer.psid) ? { ...customer, ...updates.get(customer.psid) } : customer
  )
}
