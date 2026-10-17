export function getFacebookGraphConfig() {
  const pageId = process.env.FACEBOOK_PAGE_ID
  const accessToken = process.env.FACEBOOK_PAGE_ACCESS_TOKEN
  const version = process.env.FACEBOOK_GRAPH_VERSION || 'v21.0'
  if (!pageId || !accessToken) return null
  return { pageId, accessToken, version }
}

export function getInstagramGraphConfig() {
  const accessToken = process.env.IG_ACCESS_TOKEN
  const version = process.env.INSTAGRAM_GRAPH_VERSION || 'v25.0'
  if (!accessToken) return null
  return { accessToken, version }
}

export async function facebookGraphRequest(path, { method = 'GET', body, query = {} } = {}) {
  const config = getFacebookGraphConfig()
  if (!config) throw new Error('Facebook Page API credentials are not configured')

  const url = new URL(`https://graph.facebook.com/${config.version}/${path.replace(/^\/+/, '')}`)
  url.searchParams.set('access_token', config.accessToken)
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value)

  const response = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  })
  const result = await response.json().catch(() => ({}))
  if (!response.ok) {
    const graphError = result.error || {}
    const code = graphError.code ? ` (code ${graphError.code}${graphError.error_subcode ? `/${graphError.error_subcode}` : ''})` : ''
    throw new Error(`${graphError.message || 'Facebook Graph API request failed'}${code}`)
  }
  return result
}

export async function instagramGraphRequest(path, { method = 'GET', body, query = {} } = {}) {
  const config = getInstagramGraphConfig()
  if (!config) throw new Error('IG_ACCESS_TOKEN is not configured')

  const url = new URL(`https://graph.instagram.com/${config.version}/${path.replace(/^\/+/, '')}`)
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value)

  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${config.accessToken}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  })
  const result = await response.json().catch(() => ({}))
  if (!response.ok) {
    const graphError = result.error || {}
    const code = graphError.code ? ` (code ${graphError.code}${graphError.error_subcode ? `/${graphError.error_subcode}` : ''})` : ''
    throw new Error(`${graphError.message || 'Instagram Graph API request failed'}${code}`)
  }
  return result
}

function combinedName(profile) {
  const full = typeof profile?.name === 'string' ? profile.name.trim() : ''
  if (full) return full
  return [profile?.first_name, profile?.last_name].filter(Boolean).join(' ').trim() || null
}

export async function getFacebookProfileName(psid) {
  const profile = await fetchMessengerProfile(psid)
  return profile?.name || null
}

// Page-scoped IDs (people who commented or messaged the Page) often reject the
// `profile_pic` field but still serve the /picture edge. Silhouettes are ignored
// so the dashboard shows initials instead of Facebook's grey placeholder.
export async function fetchFacebookPictureUrl(id) {
  try {
    const result = await facebookGraphRequest(`${encodeURIComponent(id)}/picture`, {
      query: { redirect: 'false', type: 'large' },
    })
    const data = result?.data
    if (data?.url && !data.is_silhouette) return data.url
  } catch {
    // Not available for this account; callers fall back to initials.
  }
  return null
}

export async function fetchMessengerProfile(psid) {
  const fields = ['first_name,last_name,name,profile_pic', 'first_name,last_name,profile_pic', 'name']
  let profile = null
  for (const fieldSet of fields) {
    try {
      const result = await facebookGraphRequest(encodeURIComponent(psid), { query: { fields: fieldSet } })
      profile = {
        name: combinedName(result),
        username: typeof result.username === 'string' ? result.username.trim() : null,
        profile_pic_url: result.profile_pic || null,
      }
      break
    } catch {
      continue
    }
  }
  if (!profile?.profile_pic_url) {
    const picture = await fetchFacebookPictureUrl(psid)
    if (picture) profile = { name: null, username: null, ...(profile || {}), profile_pic_url: picture }
  }
  return profile
}

export async function fetchInstagramUserProfile(igsid) {
  const id = String(igsid || '').replace(/^ig_/, '')
  const result = await instagramGraphRequest(encodeURIComponent(id), {
    query: { fields: 'name,username,profile_pic' },
  })
  return {
    name: combinedName(result),
    username: typeof result.username === 'string' ? result.username.replace(/^@/, '').trim() : null,
    profile_pic_url: result.profile_pic || null,
  }
}

export async function fetchSocialProfile(psid, platform) {
  if (platform === 'instagram') return fetchInstagramUserProfile(psid)
  if (platform === 'facebook') return fetchMessengerProfile(psid)
  return null
}
