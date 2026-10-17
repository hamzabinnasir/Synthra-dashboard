'use client'

import { useState, Suspense } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'

function ResetPasswordForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get('token') || ''
  const email = searchParams.get('email') || ''

  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  const handleReset = async (e) => {
    e.preventDefault()
    if (!token) {
      setError('Reset token is missing from the link.')
      return
    }
    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters long.')
      return
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, newPassword, email }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Password reset failed')
      }
      setSuccess(true)
      setTimeout(() => {
        router.push('/login')
      }, 2500)
    } catch (err) {
      setError(err.message || 'Password reset failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-card w-full max-w-md rounded-2xl border p-6 sm:p-8 shadow-2xl backdrop-blur-xl">
      <div className="mb-8 text-center">
        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-(--surface-raised) p-2 shadow-inner">
          <Image src="/synthra-mark.svg" alt="Synthra" width={44} height={44} priority className="h-10 w-10" />
        </div>
        <h1 className="theme-text text-2xl font-bold tracking-tight">Set New Password</h1>
        <p className="theme-muted mt-1 text-xs sm:text-sm">Create a strong password for your admin account</p>
      </div>

      {error && (
        <div role="alert" className="mb-5 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-center text-xs text-red-400">
          {error}
        </div>
      )}

      {success ? (
        <div role="status" className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-center text-sm text-emerald-400">
          <p className="font-semibold mb-1">Password updated successfully!</p>
          <p className="text-xs opacity-80">Redirecting to sign in page...</p>
          <Link href="/login" className="mt-3 inline-block font-semibold underline text-xs">
            Sign in now
          </Link>
        </div>
      ) : (
        <form onSubmit={handleReset} className="space-y-4">
          <div>
            <label className="theme-muted block text-xs font-semibold uppercase tracking-wider mb-1.5" htmlFor="reset-new-password">
              New Password (min 8 characters)
            </label>
            <input
              id="reset-new-password"
              type="password"
              required
              minLength={8}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="••••••••••••"
              className="chat-input w-full rounded-xl px-4 py-3 text-sm outline-none transition focus:border-(--accent)"
            />
          </div>

          <div>
            <label className="theme-muted block text-xs font-semibold uppercase tracking-wider mb-1.5" htmlFor="reset-confirm-password">
              Confirm New Password
            </label>
            <input
              id="reset-confirm-password"
              type="password"
              required
              minLength={8}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="••••••••••••"
              className="chat-input w-full rounded-xl px-4 py-3 text-sm outline-none transition focus:border-(--accent)"
            />
          </div>

          <button
            type="submit"
            disabled={loading || !newPassword || !confirmPassword}
            className="chat-send-button mt-2 w-full h-11 rounded-xl text-sm font-bold shadow-lg transition hover:brightness-110 disabled:opacity-50"
          >
            {loading ? 'Updating password...' : 'Update Password'}
          </button>
        </form>
      )}

      <div className="mt-6 border-t border-(--line) pt-4 text-center">
        <Link href="/login" className="theme-link inline-flex items-center gap-1.5 text-xs font-semibold">
          <span>←</span> Back to Sign In
        </Link>
      </div>
    </div>
  )
}

export default function ResetPasswordPage() {
  return (
    <div className="auth-shell flex min-h-screen items-center justify-center p-4">
      <Suspense fallback={<div className="theme-muted text-sm">Loading...</div>}>
        <ResetPasswordForm />
      </Suspense>
    </div>
  )
}
