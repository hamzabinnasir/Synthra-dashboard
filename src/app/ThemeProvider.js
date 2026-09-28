'use client'

import { createContext, useContext, useEffect, useSyncExternalStore } from 'react'

const ThemeContext = createContext(null)
const themeChangeEvent = 'synthra-theme-change'

function subscribe(callback) {
  window.addEventListener('storage', callback)
  window.addEventListener(themeChangeEvent, callback)

  return () => {
    window.removeEventListener('storage', callback)
    window.removeEventListener(themeChangeEvent, callback)
  }
}

function getThemeSnapshot() {
  return window.localStorage.getItem('synthra-theme') === 'light' ? 'light' : 'dark'
}

function getServerThemeSnapshot() {
  return 'dark'
}

export function ThemeProvider({ children }) {
  const theme = useSyncExternalStore(subscribe, getThemeSnapshot, getServerThemeSnapshot)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

  const changeTheme = (nextTheme) => {
    window.localStorage.setItem('synthra-theme', nextTheme)
    document.documentElement.dataset.theme = nextTheme
    window.dispatchEvent(new Event(themeChangeEvent))
  }

  return <ThemeContext.Provider value={{ theme, changeTheme }}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) throw new Error('useTheme must be used inside ThemeProvider')
  return context
}