'use client'

import { useRef, useState, useEffect, useId, KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { Search, X, Loader2, Briefcase, FileText, User, UserCheck } from 'lucide-react'
import Link from 'next/link'
import { useGlobalSearch } from '@/lib/hooks/use-global-search'
import { Input } from '@/components/ui/input'
import type { SearchResult } from '@/lib/search'

// ── Helpers ───────────────────────────────────────────────────────────────────

function resultHref(r: SearchResult): string {
  switch (r.type) {
    case 'project':    return `/dashboard/projects/${r.id}`
    case 'contract':   return `/dashboard/contracts/${r.id}`
    case 'freelancer': return `/freelancers/${r.id}`
    case 'client':     return `/clients/${r.id}`
  }
}

function resultLabel(r: SearchResult): string {
  switch (r.type) {
    case 'project':    return r.title
    case 'contract':   return `Contract · ${r.totalAmount} ${r.currency}`
    case 'freelancer': return r.name
    case 'client':     return r.name
  }
}

function resultSubLabel(r: SearchResult): string {
  switch (r.type) {
    case 'project':    return r.status
    case 'contract':   return r.status
    case 'freelancer': return r.skills.slice(0, 3).join(', ') || r.bio.slice(0, 60)
    case 'client':     return r.walletAddress.slice(0, 16) + '…'
  }
}

const TYPE_ICON: Record<SearchResult['type'], React.ReactNode> = {
  project:    <Briefcase  className="h-4 w-4 shrink-0 text-blue-500"  />,
  contract:   <FileText   className="h-4 w-4 shrink-0 text-violet-500" />,
  freelancer: <User       className="h-4 w-4 shrink-0 text-emerald-500" />,
  client:     <UserCheck  className="h-4 w-4 shrink-0 text-amber-500"  />,
}

// ── Skeleton row ──────────────────────────────────────────────────────────────

function SkeletonRow() {
  return (
    <div className="flex items-center gap-3 px-4 py-3 animate-pulse">
      <div className="h-4 w-4 rounded bg-muted" />
      <div className="flex-1 space-y-1.5">
        <div className="h-3 w-1/2 rounded bg-muted" />
        <div className="h-2.5 w-1/3 rounded bg-muted/60" />
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function GlobalSearchBar() {
  const inputId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [isOpen, setIsOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({})

  const { query, setQuery, results, isLoading, error, clear } = useGlobalSearch()

  const allResults = results?.results ?? []
  const hasResults = allResults.length > 0
  const showDropdown = isOpen && query.trim().length >= 2

  // Position the portal dropdown below the input
  useEffect(() => {
    if (!showDropdown || !containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    setDropdownStyle({
      position: 'fixed',
      top: rect.bottom + 6,
      left: rect.left,
      width: rect.width,
      zIndex: 9999,
    })
  }, [showDropdown, query])

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setIsOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (!showDropdown) return
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setActiveIndex(i => Math.min(i + 1, allResults.length - 1))
        break
      case 'ArrowUp':
        e.preventDefault()
        setActiveIndex(i => Math.max(i - 1, -1))
        break
      case 'Enter':
        if (activeIndex >= 0 && allResults[activeIndex]) {
          window.location.href = resultHref(allResults[activeIndex])
        }
        break
      case 'Escape':
        clear()
        setIsOpen(false)
        inputRef.current?.blur()
        break
    }
  }

  function handleClear() {
    clear()
    setIsOpen(false)
    inputRef.current?.focus()
  }

  const dropdown = showDropdown ? (
    <div
      style={dropdownStyle}
      id="global-search-listbox"
      role="listbox"
      aria-label="Search results"
      className="rounded-xl border border-border/60 bg-background shadow-xl ring-1 ring-black/5 overflow-hidden"
    >
      {/* Loading skeleton */}
      {isLoading && (
        <div>
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
        </div>
      )}

      {/* Error state */}
      {!isLoading && error && (
        <p className="px-4 py-3 text-sm text-destructive">{error}</p>
      )}

      {/* No results */}
      {!isLoading && !error && !hasResults && (
        <div className="flex flex-col items-center gap-1 px-4 py-6 text-center">
          <Search className="h-8 w-8 text-muted-foreground/40" />
          <p className="text-sm font-medium text-foreground">No results found</p>
          <p className="text-xs text-muted-foreground">Try a different keyword</p>
        </div>
      )}

      {/* Results */}
      {!isLoading && hasResults && (
        <ul>
          {allResults.map((result, idx) => (
            <li
              key={`${result.type}-${result.id}`}
              id={`result-${idx}`}
              role="option"
              aria-selected={idx === activeIndex}
            >
              <Link
                href={resultHref(result)}
                onClick={() => { setIsOpen(false) }}
                className={`flex items-center gap-3 px-4 py-3 transition-colors text-sm
                  ${idx === activeIndex
                    ? 'bg-muted text-foreground'
                    : 'text-foreground hover:bg-muted/60'
                  }`}
              >
                {TYPE_ICON[result.type]}
                <span className="flex flex-col min-w-0">
                  <span className="truncate font-medium">{resultLabel(result)}</span>
                  <span className="truncate text-xs text-muted-foreground capitalize">
                    {result.type} · {resultSubLabel(result)}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  ) : null

  return (
    <div ref={containerRef} className="relative w-full max-w-sm">
      <label htmlFor={inputId} className="sr-only">Search projects, contracts, freelancers, clients</label>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          id={inputId}
          ref={inputRef}
          type="search"
          autoComplete="off"
          placeholder="Search…"
          role="combobox"
          aria-expanded={showDropdown}
          aria-controls="global-search-listbox"
          aria-autocomplete="list"
          aria-activedescendant={activeIndex >= 0 ? `result-${activeIndex}` : undefined}
          value={query}
          onChange={e => {
            setActiveIndex(-1)
            setQuery(e.target.value)
            setIsOpen(true)
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          className="pl-9 pr-8 h-9 text-sm"
        />
        {query && (
          <button
            type="button"
            aria-label="Clear search"
            onClick={handleClear}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
          >
            {isLoading
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <X className="h-4 w-4" />
            }
          </button>
        )}
      </div>

      {typeof window !== 'undefined' && createPortal(dropdown, document.body)}
    </div>
  )
}
