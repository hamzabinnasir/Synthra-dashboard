'use client'

import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleLogin = async (e) => {
    e.preventDefault()
    if (!email || !password) return
    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Login failed')
      }
      router.push('/')
      router.refresh()
    } catch (err) {
      setError(err.message || 'Login failed')
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
          <h1 className="theme-text text-2xl font-bold tracking-tight">Synthra Admin</h1>
          <p className="theme-muted mt-1 text-xs sm:text-sm">Sign in to manage WhatsApp, Facebook & Instagram automation</p>
        </div>

        {error && (
          <div role="alert" className="mb-5 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-center text-xs text-red-400">
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="theme-muted block text-xs font-semibold uppercase tracking-wider mb-1.5" htmlFor="login-email">
              Email Address
            </label>
            <input
              id="login-email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@example.com"
              className="chat-input w-full rounded-xl px-4 py-3 text-sm outline-none transition focus:border-(--accent)"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="theme-muted block text-xs font-semibold uppercase tracking-wider" htmlFor="login-password">
                Password
              </label>
              <Link href="/forgot-password" className="brand-accent text-xs hover:underline">
                Forgot password?
              </Link>
            </div>
            <div className="relative">
              <input
                id="login-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="chat-input w-full rounded-xl px-4 py-3 pr-12 text-sm outline-none transition focus:border-(--accent)"
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-xs opacity-50 hover:opacity-100"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading || !email || !password}
            className="chat-send-button mt-2 w-full h-11 rounded-xl text-sm font-bold shadow-lg transition hover:brightness-110 disabled:opacity-50"
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  )
}
