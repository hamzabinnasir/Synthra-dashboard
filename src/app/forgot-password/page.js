'use client'

import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!email) return
    setLoading(true)
    setError('')
    setMessage('')


    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Request failed')
      }
      setMessage(data.message || 'If an account exists for that email, a password reset link has been sent.')
    } catch (err) {
      setError(err.message || 'Request failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-shell flex min-h-screen items-center justify-center p-4">
      <div className="auth-card w-full max-w-md rounded-2xl border p-6 sm:p-8 shadow-2xl backdrop-blur-xl">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-(--surface-raised) p-2 shadow-inner">
            <Image src="/synthra-mark.svg" alt="Synthra" width={44} height={44} priority className="h-10 w-10" />
          </div>
          <h1 className="theme-text text-2xl font-bold tracking-tight">Reset Password</h1>
          <p className="theme-muted mt-1 text-xs sm:text-sm">Enter your admin email to receive a secure password reset link</p>
        </div>

        {error && (
          <div role="alert" className="mb-5 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-center text-xs text-red-400">
            {error}
          </div>
        )}

        {message && (
          <div role="status" className="mb-5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-center text-xs text-emerald-400">
            <p>{message}</p>

          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="theme-muted block text-xs font-semibold uppercase tracking-wider mb-1.5" htmlFor="forgot-email">
              Admin Email Address
            </label>
            <input
              id="forgot-email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@example.com"
              className="chat-input w-full rounded-xl px-4 py-3 text-sm outline-none transition focus:border-(--accent)"
            />
          </div>

          <button
            type="submit"
            disabled={loading || !email}
            className="chat-send-button mt-2 w-full h-11 rounded-xl text-sm font-bold shadow-lg transition hover:brightness-110 disabled:opacity-50"
          >
            {loading ? 'Generating link...' : 'Send Reset Link'}
          </button>
        </form>

        <div className="mt-6 border-t border-(--line) pt-4 text-center">
          <Link href="/login" className="theme-link inline-flex items-center gap-1.5 text-xs font-semibold">
            <span>←</span> Back to Sign In
          </Link>
        </div>
      </div>
    </div>
  )
}
