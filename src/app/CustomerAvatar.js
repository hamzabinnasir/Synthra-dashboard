'use client'

import { useState } from 'react'

// Stable colour per person so the same contact always looks the same in lists,
// comments and chat headers when they have no profile photo.
function colourFor(seed) {
  const text = String(seed || '')
  let hash = 0
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 31 + text.charCodeAt(index)) >>> 0
  }
  return `hsl(${hash % 360} 52% 36%)`
}

export default function CustomerAvatar({ src, initials, className = '', seed = '' }) {
  // Facebook / Instagram CDN links can expire; fall back to initials instead of a broken image.
  const [failedSrc, setFailedSrc] = useState(null)

  if (src && failedSrc !== src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt=""
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setFailedSrc(src)}
        className={`object-cover ${className}`}
      />
    )
  }

  const style = seed
    ? { background: colourFor(seed), color: '#ffffff', borderColor: 'transparent' }
    : undefined

  return (
    <span className={className} style={style} aria-hidden="true">
      {initials}
    </span>
  )
}
