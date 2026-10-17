'use client'

import { useState } from 'react'

/**
 * Resolves media URL: WhatsApp Cloud API lookaside URLs require authorization
 * so we route them through the dashboard's /api/media-proxy.
 */
export function getResolvedMediaUrl(url) {
  if (!url) return ''
  const trimmed = String(url).trim()
  if (
    trimmed.includes('lookaside.fbsbx.com') ||
    trimmed.includes('graph.facebook.com') ||
    trimmed.startsWith('lookaside:')
  ) {
    return `/api/media-proxy?url=${encodeURIComponent(trimmed)}`
  }
  return trimmed
}

export default function MediaMessage({ message, incoming = true }) {
  const [modalOpen, setModalOpen] = useState(false)
  const [loadError, setLoadError] = useState(false)

  if (!message?.media_url && !message?.media_type) {
    return null
  }

  if (message.media_url === '__media_unavailable__' || message.media_status === 'failed') {
    return (
      <div className="my-1.5 rounded-xl border border-(--line) bg-(--surface-raised) p-3 text-xs theme-muted max-w-sm">
        Media could not be saved. The original platform link expired or the upload failed.
      </div>
    )
  }

  const rawUrl = message.media_url
  const resolvedUrl = getResolvedMediaUrl(rawUrl)
  const mediaType = (message.media_type || '').toLowerCase()
  const mimeType = (message.media_mime_type || '').toLowerCase()
  const filename = message.media_filename || 'Attachment'

  // Type inference
  const isImage =
    mediaType === 'image' ||
    mimeType.startsWith('image/') ||
    /\.(jpe?g|png|webp|gif|svg|bmp)(\?.*)?$/i.test(rawUrl || '')

  const isVideo =
    mediaType === 'video' ||
    mimeType.startsWith('video/') ||
    /\.(mp4|webm|mov|m4v|ogv)(\?.*)?$/i.test(rawUrl || '')

  const isAudio =
    mediaType === 'audio' ||
    mediaType === 'voice' ||
    mimeType.startsWith('audio/') ||
    /\.(mp3|ogg|wav|m4a|aac|opus)(\?.*)?$/i.test(rawUrl || '')

  return (
    <div className="media-message-container my-1.5 flex flex-col gap-1.5">
      {/* IMAGE */}
      {isImage && (
        <>
          <div className="relative group overflow-hidden rounded-xl border border-(--line) bg-black/20 max-w-sm">
            {!loadError ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={resolvedUrl}
                alt={filename}
                onError={() => setLoadError(true)}
                onClick={() => setModalOpen(true)}
                className="max-h-72 w-auto max-w-full rounded-xl object-contain cursor-pointer transition hover:scale-[1.01]"
                loading="lazy"
              />
            ) : (
              <div className="p-4 text-xs text-red-300 flex items-center gap-2">
                <span>⚠️ Unable to load image preview.</span>
                <a
                  href={resolvedUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline font-medium hover:text-white"
                >
                  Open directly
                </a>
              </div>
            )}
            <div className="absolute bottom-1 right-1 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity bg-black/60 backdrop-blur-xs rounded px-2 py-0.5 text-[10px] text-white">
              <button
                type="button"
                onClick={() => setModalOpen(true)}
                className="hover:underline cursor-pointer"
              >
                Expand 🔍
              </button>
              <span>·</span>
              <a
                href={resolvedUrl}
                target="_blank"
                rel="noopener noreferrer"
                download={filename}
                className="hover:underline"
              >
                Save 💾
              </a>
            </div>
          </div>

          {/* Fullscreen Modal Lightbox */}
          {modalOpen && (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in"
              onClick={() => setModalOpen(false)}
            >
              <div
                className="relative max-h-[90vh] max-w-[90vw] overflow-hidden rounded-2xl bg-black border border-white/20 shadow-2xl"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between border-b border-white/10 px-4 py-2 bg-black/60 text-white text-xs">
                  <span className="truncate max-w-xs">{filename}</span>
                  <div className="flex items-center gap-3">
                    <a
                      href={resolvedUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      download={filename}
                      className="hover:text-cyan-400 font-medium"
                    >
                      Download
                    </a>
                    <button
                      type="button"
                      onClick={() => setModalOpen(false)}
                      className="text-lg leading-none hover:text-red-400 cursor-pointer"
                    >
                      ✕
                    </button>
                  </div>
                </div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={resolvedUrl}
                  alt={filename}
                  className="max-h-[80vh] max-w-[85vw] object-contain mx-auto"
                />
              </div>
            </div>
          )}
        </>
      )}

      {/* VIDEO */}
      {isVideo && (
        <div className="rounded-xl border border-(--line) overflow-hidden max-w-md bg-black/30">
          <video
            controls
            preload="metadata"
            src={resolvedUrl}
            className="w-full max-h-72 rounded-xl"
          >
            Your browser does not support the video tag.
          </video>
          {filename && filename !== 'Attachment' && (
            <div className="px-3 py-1.5 text-[11px] theme-muted flex items-center justify-between border-t border-(--line)">
              <span className="truncate">{filename}</span>
              <a
                href={resolvedUrl}
                target="_blank"
                rel="noopener noreferrer"
                download={filename}
                className="hover:underline font-semibold text-cyan-400"
              >
                Download
              </a>
            </div>
          )}
        </div>
      )}

      {/* AUDIO / VOICE NOTE */}
      {isAudio && (
        <div className="rounded-xl border border-(--line) p-2.5 bg-black/20 flex flex-col gap-1.5 max-w-sm">
          <div className="flex items-center justify-between text-[11px] font-semibold text-(--muted)">
            <span className="flex items-center gap-1.5">
              <span>🎙️</span>
              <span>{mediaType === 'voice' ? 'Voice Note' : 'Audio Message'}</span>
            </span>
            {mimeType && <span className="text-[10px] uppercase opacity-75">{mimeType.split('/')[1] || 'audio'}</span>}
          </div>
          <audio
            controls
            preload="metadata"
            src={resolvedUrl}
            className="w-full h-9 rounded"
          >
            Your browser does not support audio playback.
          </audio>
        </div>
      )}

      {/* DOCUMENT / FILE (FALLBACK) */}
      {!isImage && !isVideo && !isAudio && (
        <div className="flex items-center gap-3 rounded-xl border border-(--line) bg-(--surface-raised) p-3 max-w-sm shadow-xs">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-(--accent)/15 text-lg font-bold text-(--accent)">
            📄
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-semibold text-(--foreground)" title={filename}>
              {filename}
            </p>
            <p className="text-[11px] theme-muted">
              {mimeType ? mimeType.toUpperCase() : 'Document file'}
            </p>
          </div>
          <a
            href={resolvedUrl}
            target="_blank"
            rel="noopener noreferrer"
            download={filename}
            className="shrink-0 rounded-lg bg-(--accent) px-3 py-1.5 text-xs font-semibold text-(--accent-text) transition hover:brightness-110"
          >
            Download
          </a>
        </div>
      )}
    </div>
  )
}
