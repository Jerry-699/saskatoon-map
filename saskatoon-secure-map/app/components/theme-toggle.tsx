'use client'

import { useEffect, useState } from 'react'

const STORAGE_KEY = 'saskatoonTheme'
const OVERRIDE_UNTIL_KEY = 'saskatoonThemeOverrideUntil'

type Theme = 'light' | 'dark'

function automaticTheme(date = new Date()): Theme {
  const hour = date.getHours()
  return hour >= 19 || hour < 7 ? 'dark' : 'light'
}

function nextBoundary(date = new Date()) {
  const next = new Date(date)
  const hour = date.getHours()
  if (hour < 7) next.setHours(7, 0, 0, 0)
  else if (hour < 19) next.setHours(19, 0, 0, 0)
  else {
    next.setDate(next.getDate() + 1)
    next.setHours(7, 0, 0, 0)
  }
  return next.getTime()
}

function currentTheme(): Theme {
  const stored = localStorage.getItem(STORAGE_KEY) as Theme | null
  const until = Number(localStorage.getItem(OVERRIDE_UNTIL_KEY) || 0)
  if ((stored === 'dark' || stored === 'light') && until > Date.now()) return stored
  return automaticTheme()
}

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme
  document.documentElement.style.colorScheme = theme
}

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('light')

  useEffect(() => {
    const sync = () => {
      const next = currentTheme()
      setTheme(next)
      applyTheme(next)
      const until = Number(localStorage.getItem(OVERRIDE_UNTIL_KEY) || 0)
      if (until <= Date.now()) {
        localStorage.removeItem(STORAGE_KEY)
        localStorage.removeItem(OVERRIDE_UNTIL_KEY)
      }
    }
    sync()
    const timer = window.setInterval(sync, 30000)
    return () => window.clearInterval(timer)
  }, [])

  function toggleTheme() {
    const next: Theme = theme === 'dark' ? 'light' : 'dark'
    localStorage.setItem(STORAGE_KEY, next)
    localStorage.setItem(OVERRIDE_UNTIL_KEY, String(nextBoundary()))
    setTheme(next)
    applyTheme(next)
  }

  return (
    <button
      className="theme-toggle"
      type="button"
      onClick={toggleTheme}
      aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
    >
      <span aria-hidden="true">{theme === 'dark' ? '☀️' : '🌙'}</span>
      <span>{theme === 'dark' ? 'Light' : 'Dark'}</span>
    </button>
  )
}
