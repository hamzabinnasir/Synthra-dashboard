'use client'

import { useTheme } from './ThemeProvider'

export default function ThemeToggle() {
  const { theme, changeTheme } = useTheme()

  return (
    <div className="theme-toggle" role="group" aria-label="Color theme">
      <button
        type="button"
        aria-label="Use light mode"
        aria-pressed={theme === 'light'}
        onClick={() => changeTheme('light')}
        className={theme === 'light' ? 'theme-toggle__button is-selected' : 'theme-toggle__button'}
      >
        <span aria-hidden="true">☼</span>
        <span>Light</span>
      </button>
      <button
        type="button"
        aria-label="Use dark mode"
        aria-pressed={theme === 'dark'}
        onClick={() => changeTheme('dark')}
        className={theme === 'dark' ? 'theme-toggle__button is-selected' : 'theme-toggle__button'}
      >
        <span aria-hidden="true">◐</span>
        <span>Dark</span>
      </button>
    </div>
  )
}