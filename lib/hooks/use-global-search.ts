'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import type { GlobalSearchResponse } from '@/lib/search'

const DEBOUNCE_MS = 300
const MIN_QUERY_LEN = 2

interface UseGlobalSearchReturn {
  query: string
  setQuery: (q: string) => void
  results: GlobalSearchResponse | null
  isLoading: boolean
  error: string | null
  clear: () => void
}

export function useGlobalSearch(): UseGlobalSearchReturn {
  const [query, setQueryRaw] = useState('')
  const [results, setResults] = useState<GlobalSearchResponse | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Refs avoid stale closures in the debounce callback
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const abortController = useRef<AbortController | null>(null)

  const fetchResults = useCallback(async (q: string) => {
    // Cancel any in-flight request
    abortController.current?.abort()
    abortController.current = new AbortController()

    setIsLoading(true)
    setError(null)

    try {
      const res = await fetch(
        `/api/search?q=${encodeURIComponent(q)}`,
        { signal: abortController.current.signal },
      )
      if (!res.ok) throw new Error(`Search request failed: ${res.status}`)
      const data: GlobalSearchResponse = await res.json()
      setResults(data)
    } catch (err) {
      if ((err as Error).name === 'AbortError') return // ignore intentional aborts
      setError('Search failed. Please try again.')
      setResults(null)
    } finally {
      setIsLoading(false)
    }
  }, [])

  const setQuery = useCallback((q: string) => {
    setQueryRaw(q)
    if (debounceTimer.current) clearTimeout(debounceTimer.current)

    if (q.trim().length < MIN_QUERY_LEN) {
      setResults(null)
      setIsLoading(false)
      return
    }

    setIsLoading(true) // show skeleton immediately on input
    debounceTimer.current = setTimeout(() => fetchResults(q.trim()), DEBOUNCE_MS)
  }, [fetchResults])

  const clear = useCallback(() => {
    setQueryRaw('')
    setResults(null)
    setError(null)
    setIsLoading(false)
    abortController.current?.abort()
    if (debounceTimer.current) clearTimeout(debounceTimer.current)
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      abortController.current?.abort()
      if (debounceTimer.current) clearTimeout(debounceTimer.current)
    }
  }, [])

  return { query, setQuery, results, isLoading, error, clear }
}
