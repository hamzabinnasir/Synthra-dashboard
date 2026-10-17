const PLATFORMS = {
  facebook: { label: 'Facebook', colour: '#1877f2' },
  instagram: { label: 'Instagram', colour: '#e1306c' },
  whatsapp: { label: 'WhatsApp', colour: '#25d366' },
}

export function PlatformBadge({ platform = 'facebook', className = '' }) {
  const meta = PLATFORMS[platform] || PLATFORMS.facebook
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-px text-[10px] font-semibold leading-4 ${className}`}
      style={{
        color: meta.colour,
        borderColor: `color-mix(in srgb, ${meta.colour} 45%, transparent)`,
        background: `color-mix(in srgb, ${meta.colour} 12%, transparent)`,
      }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: meta.colour }} />
      {meta.label}
    </span>
  )
}

const TONES = {
  good: '#36e5ad',
  warn: '#f5be5b',
  bad: '#ff6b6b',
  info: '#24d9e6',
  neutral: '#8b97a8',
}

export function StatusChip({ tone = 'neutral', children, title }) {
  const colour = TONES[tone] || TONES.neutral
  return (
    <span
      title={title}
      className="inline-flex items-center rounded-full border px-2 py-px text-[10px] font-semibold leading-4"
      style={{
        color: colour,
        borderColor: `color-mix(in srgb, ${colour} 45%, transparent)`,
        background: `color-mix(in srgb, ${colour} 12%, transparent)`,
      }}
    >
      {children}
    </span>
  )
}

export function humanize(value) {
  const text = String(value || '').replace(/_/g, ' ').trim()
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : ''
}

export function classificationTone(value) {
  const text = String(value || '').toLowerCase()
  if (/(spam|abus|hate|scam|toxic|negative|complain)/.test(text)) return 'bad'
  if (/(human|handoff|sensitive|urgent)/.test(text)) return 'warn'
  if (/(positive|praise|lead|question|inquiry)/.test(text)) return 'good'
  return 'neutral'
}

export function actionTone(value) {
  const text = String(value || '').toLowerCase()
  if (!text) return 'neutral'
  if (/(error|failed|fail)/.test(text)) return 'bad'
  if (/(handoff|human)/.test(text)) return 'warn'
  if (/(hidden|hide|deleted|removed)/.test(text)) return 'warn'
  if (/(sent|replied|reply)/.test(text)) return 'good'
  return 'info'
}

/** "just now", "5m ago", "3h ago", "2d ago", otherwise a short date. */
export function formatRelative(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const seconds = Math.round((Date.now() - date.getTime()) / 1000)
  if (seconds < 45) return 'just now'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  if (days < 7) return `${days}d ago`
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(date)
}
