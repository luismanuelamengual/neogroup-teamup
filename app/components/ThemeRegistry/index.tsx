'use client'

import createCache from '@emotion/cache'
import { CacheProvider } from '@emotion/react'
import CssBaseline from '@mui/material/CssBaseline'
import { createTheme, ThemeProvider } from '@mui/material/styles'
import { useServerInsertedHTML } from 'next/navigation'
import { ReactNode, useState } from 'react'

const theme = createTheme({
  palette: {
    primary: {
      main: '#0f766e',
      dark: '#115e59',
      light: '#14b8a6'
    },
    secondary: {
      main: '#f59e0b'
    },
    background: {
      default: '#f6f8f8'
    }
  },
  shape: {
    borderRadius: 10
  },
  typography: {
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    button: {
      textTransform: 'none',
      fontWeight: 600
    }
  }
})

/** Emotion SSR cache + MUI theme provider for the App Router. */
export default function ThemeRegistry({ children }: { children: ReactNode }) {
  const [{ cache, flush }] = useState(() => {
    const cache = createCache({ key: 'mui' })

    cache.compat = true
    const prevInsert = cache.insert
    let inserted: string[] = []

    cache.insert = (...args) => {
      const serialized = args[1]

      if (cache.inserted[serialized.name] === undefined) {
        inserted.push(serialized.name)
      }

      return prevInsert(...args)
    }

    const flush = () => {
      const prevInserted = inserted

      inserted = []

      return prevInserted
    }

    return { cache, flush }
  })

  useServerInsertedHTML(() => {
    const names = flush()

    if (names.length === 0) {
      return null
    }

    let styles = ''

    for (const name of names) {
      styles += cache.inserted[name]
    }

    return (
      <style
        key={cache.key}
        data-emotion={`${cache.key} ${names.join(' ')}`}
        dangerouslySetInnerHTML={{ __html: styles }}
      />
    )
  })

  return (
    <CacheProvider value={cache}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        {children}
      </ThemeProvider>
    </CacheProvider>
  )
}
