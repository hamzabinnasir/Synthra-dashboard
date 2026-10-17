'use client'

import { useState, useEffect, useRef } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import ThemeToggle from '../ThemeToggle'

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const MAX_BYTES = 5 * 1024 * 1024 // 5MB

export default function ProfilePage() {
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  // Form fields
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  // Images with live local preview before saving
  const [avatarPreview, setAvatarPreview] = useState(null)
  const [coverPreview, setCoverPreview] = useState(null)
  const [avatarData, setAvatarData] = useState(null) // data url to submit
  const [coverData, setCoverData] = useState(null) // data url to submit

  const avatarInputRef = useRef(null)
  const coverInputRef = useRef(null)

  useEffect(() => {
    async function loadProfile() {
      try {
        const res = await fetch('/api/admin/profile')
        const data = await res.json()
        if (data.success && data.user) {
          setProfile(data.user)
          setName(data.user.name || '')
          setEmail(data.user.email || '')
          setAvatarPreview(data.user.avatar_url || null)
          setCoverPreview(data.user.cover_url || null)
        }
      } catch (err) {
        setError('Could not load profile.')
      } finally {
        setLoading(false)
      }
    }
    loadProfile()
  }, [])

  const handleFileSelect = (file, type) => {
    setError('')
    setMessage('')
    if (!file) return

    if (!ALLOWED_TYPES.includes(file.type)) {
      setError(`Invalid file type (${file.type}). Please select a JPEG, PNG, or WebP image.`)
      return
    }

    if (file.size > MAX_BYTES) {
      setError(`File is too large (${(file.size / (1024 * 1024)).toFixed(1)}MB). Maximum allowed size is 5MB.`)
      return
    }

    const reader = new FileReader()
    reader.onload = (e) => {
      const dataUrl = e.target.result
      if (type === 'avatar') {
        setAvatarPreview(dataUrl)
        setAvatarData(dataUrl)
      } else if (type === 'cover') {
        setCoverPreview(dataUrl)
        setCoverData(dataUrl)
      }
    }
    reader.readAsDataURL(file)
  }

  const handleSave = async (e) => {
    e.preventDefault()
    setError('')
    setMessage('')

    if (newPassword && newPassword.length < 8) {
      setError('New password must be at least 8 characters long.')
      return
    }

    if (newPassword && newPassword !== confirmPassword) {
      setError('New passwords do not match.')
      return
    }

    const emailChanged = profile && email.trim().toLowerCase() !== profile.email.toLowerCase()
    if ((newPassword || emailChanged) && !currentPassword) {
      setError('Current password is required to change password or email.')
      return
    }

    setSaving(true)

    try {
      const payload = {
        name: name.trim(),
        email: email.trim(),
        currentPassword: currentPassword || undefined,
        newPassword: newPassword || undefined,
        avatar: avatarData !== null ? avatarData : undefined,
        cover: coverData !== null ? coverData : undefined,
      }

      const res = await fetch('/api/admin/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json().catch(() => ({}))

      if (res.status === 401) {
        setError(data.error || 'Your session has expired. Redirecting to sign in…')
        setTimeout(() => {
          window.location.href = '/login?redirect=/profile'
        }, 1500)
        return
      }

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to update profile')
      }

      setMessage('Profile updated successfully!')
      const refreshed = await fetch('/api/admin/profile', { cache: 'no-store' })
      const latest = await refreshed.json()
      const user = latest.success && latest.user ? latest.user : data.user
      setProfile(user)
      setName(user.name || '')
      setEmail(user.email || '')
      setAvatarPreview(user.avatar_url || null)
      setCoverPreview(user.cover_url || null)
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setAvatarData(null)
      setCoverData(null)
    } catch (err) {
      setError(err.message || 'Profile update failed')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="app-shell flex min-h-screen items-center justify-center">
        <p className="theme-muted text-sm">Loading profile...</p>
      </div>
    )
  }

  return (
    <div className="app-shell min-h-screen pb-16">
      {/* Top Header */}
      <header className="app-header border-b">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <Link href="/" className="theme-link flex h-9 w-9 items-center justify-center rounded-full text-lg">
              ←
            </Link>
            <Image src="/synthra-mark.svg" alt="Synthra" width={36} height={36} priority className="h-9 w-9" />
            <div>
              <h1 className="theme-text text-base font-bold">Admin Profile</h1>
              <p className="theme-muted text-xs">Manage your credentials and dashboard appearance</p>
            </div>
          </div>
          <ThemeToggle />
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6">
        {/* Cover Photo & Avatar Card */}
        <section aria-label="Profile Banner" className="relative mb-8 overflow-hidden rounded-3xl border border-(--line) bg-(--surface) shadow-xl">
          {/* Cover Photo */}
          <div className="relative h-44 w-full bg-linear-to-r from-sky-900 via-indigo-950 to-slate-900 sm:h-64">
            {coverPreview && (
              <img
                src={coverPreview}
                alt="Cover photo preview"
                className="h-full w-full object-cover"
              />
            )}
            <input
              ref={coverInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => handleFileSelect(e.target.files?.[0], 'cover')}
            />
            <button
              type="button"
              onClick={() => coverInputRef.current?.click()}
              className="absolute right-4 top-4 flex items-center gap-2 rounded-xl bg-black/60 px-3 py-2 text-xs font-semibold text-white backdrop-blur transition hover:bg-black/80"
            >
              <span>📷</span>
              <span>Change Cover Photo</span>
            </button>
            {coverData && (
              <span className="absolute bottom-3 right-4 rounded-full bg-amber-500/90 px-2.5 py-1 text-[11px] font-bold text-black shadow">
                Preview (Unsaved)
              </span>
            )}
          </div>

          {/* Avatar & User Details */}
          <div className="relative px-6 pb-6 pt-0">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div className="relative -mt-16 sm:-mt-20">
                <div className="relative h-28 w-28 overflow-hidden rounded-full border-4 border-(--surface) bg-(--surface-raised) shadow-2xl sm:h-36 sm:w-36">
                  {avatarPreview ? (
                    <img
                      src={avatarPreview}
                      alt="Avatar preview"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-3xl font-bold uppercase theme-text bg-sky-800">
                      {(name || 'A').slice(0, 2)}
                    </div>
                  )}
                  <input
                    ref={avatarInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={(e) => handleFileSelect(e.target.files?.[0], 'avatar')}
                  />
                  <button
                    type="button"
                    onClick={() => avatarInputRef.current?.click()}
                    title="Upload profile picture"
                    className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition hover:opacity-100 text-white font-semibold text-xs"
                  >
                    Change
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => avatarInputRef.current?.click()}
                  className="absolute bottom-1 right-1 flex h-8 w-8 items-center justify-center rounded-full bg-sky-500 text-white shadow-md transition hover:scale-110"
                  title="Upload profile picture"
                >
                  📷
                </button>
              </div>

              <div className="flex-1 min-w-[200px] pt-3 sm:pt-0 sm:pl-4">
                <div className="flex items-center gap-2">
                  <h2 className="theme-text text-xl font-bold sm:text-2xl">{name || 'Admin'}</h2>
                  {avatarData && (
                    <span className="rounded-full bg-amber-500/90 px-2 py-0.5 text-[10px] font-bold text-black">
                      Avatar unsaved
                    </span>
                  )}
                </div>
                <p className="theme-muted text-xs sm:text-sm font-mono mt-0.5">{email}</p>
              </div>
            </div>
          </div>
        </section>

        {/* Feedback alerts */}
        {error && (
          <div role="alert" className="mb-6 rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-400">
            {error}
          </div>
        )}
        {message && (
          <div role="status" className="mb-6 rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-4 text-sm text-emerald-400">
            {message}
          </div>
        )}

        {/* Settings Form */}
        <form onSubmit={handleSave} className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {/* General Information */}
          <div className="rounded-2xl border border-(--line) bg-(--surface) p-6 shadow-sm">
            <h3 className="theme-text text-base font-bold mb-1">Account Information</h3>
            <p className="theme-muted text-xs mb-5">Update your display name and email address</p>

            <div className="space-y-4">
              <div>
                <label className="theme-muted block text-xs font-semibold uppercase tracking-wider mb-1.5" htmlFor="profile-name">
                  Full Name
                </label>
                <input
                  id="profile-name"
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="chat-input w-full rounded-xl px-4 py-2.5 text-sm outline-none"
                />
              </div>

              <div>
                <label className="theme-muted block text-xs font-semibold uppercase tracking-wider mb-1.5" htmlFor="profile-email">
                  Email Address
                </label>
                <input
                  id="profile-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="chat-input w-full rounded-xl px-4 py-2.5 text-sm outline-none"
                />
                <p className="theme-muted text-[11px] mt-1">Requires current password if changed.</p>
              </div>
            </div>
          </div>

          {/* Password Security */}
          <div className="rounded-2xl border border-(--line) bg-(--surface) p-6 shadow-sm">
            <h3 className="theme-text text-base font-bold mb-1">Security & Password</h3>
            <p className="theme-muted text-xs mb-5">Leave new password blank if you do not wish to change it</p>

            <div className="space-y-4">
              <div>
                <label className="theme-muted block text-xs font-semibold uppercase tracking-wider mb-1.5" htmlFor="profile-current-password">
                  Current Password
                </label>
                <input
                  id="profile-current-password"
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Required for password/email change"
                  className="chat-input w-full rounded-xl px-4 py-2.5 text-sm outline-none"
                />
              </div>

              <div>
                <label className="theme-muted block text-xs font-semibold uppercase tracking-wider mb-1.5" htmlFor="profile-new-password">
                  New Password (optional)
                </label>
                <input
                  id="profile-new-password"
                  type="password"
                  minLength={8}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  className="chat-input w-full rounded-xl px-4 py-2.5 text-sm outline-none"
                />
              </div>

              <div>
                <label className="theme-muted block text-xs font-semibold uppercase tracking-wider mb-1.5" htmlFor="profile-confirm-password">
                  Confirm New Password
                </label>
                <input
                  id="profile-confirm-password"
                  type="password"
                  minLength={8}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm new password"
                  className="chat-input w-full rounded-xl px-4 py-2.5 text-sm outline-none"
                />
              </div>
            </div>
          </div>

          {/* Action Bar */}
          <div className="md:col-span-2 flex items-center justify-end gap-3 pt-2">
            <Link href="/" className="theme-muted text-xs px-4 py-2.5 hover:underline">
              Cancel
            </Link>
            <button
              type="submit"
              disabled={saving}
              className="chat-send-button px-6 py-2.5 rounded-xl text-sm font-bold shadow-lg transition hover:brightness-110 disabled:opacity-50"
            >
              {saving ? 'Saving changes...' : 'Save Profile Changes'}
            </button>
          </div>
        </form>
      </main>
    </div>
  )
}
