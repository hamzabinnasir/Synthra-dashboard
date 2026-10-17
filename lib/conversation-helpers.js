/**
 * Formats headline and sub-headline for conversations across WhatsApp, Facebook, and Instagram.
 *
 * Priority: custom dashboard name → real profile name → username / phone → ID last.
 */

export function looksLikeCustomerId(value, psid) {
  const raw = String(value || '').trim()
  if (!raw) return true
  const clean = String(psid || '').replace(/^(ig_|wa_)/, '')
  if (raw === String(psid || '') || raw === clean) return true
  if (/^(ig_|wa_)/i.test(raw)) return true
  if (/^\d{5,}$/.test(raw)) return true
  return false
}

function formatHandle(username, platform) {
  const value = String(username || '').trim().replace(/^@/, '')
  if (!value) return ''
  if (platform === 'whatsapp' || /^\d{5,}$/.test(value)) return value
  return value.startsWith('@') ? value : `@${value}`
}

export function getConversationDisplayTitles(customer, platform = 'facebook') {
  if (!customer) {
    return { headline: 'Unknown customer', subHeadline: '', initials: '??' }
  }

  const customName = typeof customer.custom_name === 'string' ? customer.custom_name.trim() : ''
  const storedName = typeof customer.name === 'string' ? customer.name.trim() : ''
  const realName = looksLikeCustomerId(storedName, customer.psid) ? '' : storedName
  const username = typeof customer.username === 'string' ? customer.username.trim().replace(/^@/, '') : ''
  const handle = formatHandle(username, platform)
  const rawId = String(customer.psid || '')
  const cleanId = rawId.replace(/^(wa_|ig_)/, '')

  const initialsFor = (text) => (text || '??').replace(/^@/, '').slice(0, 2).toUpperCase()

  if (customName) {
    const subParts = [realName && realName !== customName ? realName : '', handle].filter(Boolean)
    return {
      headline: customName,
      subHeadline: subParts.join(' · '),
      initials: initialsFor(customName),
    }
  }

  if (realName) {
    return {
      headline: realName,
      subHeadline: handle,
      initials: initialsFor(realName),
    }
  }

  if (handle) {
    return {
      headline: handle,
      subHeadline: '',
      initials: initialsFor(handle),
    }
  }

  return {
    headline: cleanId || 'Unknown customer',
    subHeadline: '',
    initials: initialsFor(cleanId),
  }
}

export function getCommentDisplayTitles(comment, platform = 'facebook') {
  if (!comment) {
    return { headline: 'Unknown commenter', subHeadline: '', initials: '??' }
  }

  const clean = (value) => (typeof value === 'string' ? value.trim() : '')
  const usable = (value) => (looksLikeCustomerId(value, comment.from_id) ? '' : value)

  // `author_*` fields come from the customers table (profile saved by the backend,
  // or a name edited in the dashboard); `from_*` come from the comment webhook itself.
  const customName = clean(comment.author_custom_name)
  const name = customName || usable(clean(comment.from_name)) || usable(clean(comment.author_stored_name))
  const username = (clean(comment.from_username) || clean(comment.author_stored_username)).replace(/^@/, '')
  const handle = formatHandle(username, platform)
  const rawId = String(comment.from_id || '')
  const cleanId = rawId.replace(/^(wa_|ig_)/, '')
  const initialsFor = (text) => (text || '??').replace(/^@/, '').slice(0, 2).toUpperCase()

  if (name) {
    return {
      headline: name,
      subHeadline: handle,
      initials: initialsFor(name),
    }
  }

  if (handle) {
    return {
      headline: handle,
      subHeadline: '',
      initials: initialsFor(handle),
    }
  }

  return {
    headline: platform === 'instagram' ? 'Instagram user' : platform === 'whatsapp' ? 'WhatsApp user' : 'Facebook user',
    subHeadline: cleanId,
    initials: initialsFor(cleanId),
  }
}
