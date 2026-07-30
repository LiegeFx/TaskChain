'use client'

import { ExternalLink } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { StellarNetwork } from '@/components/wallet-provider'

export interface ExplorerLinkProps {
  /** The URL to open in the explorer */
  href: string
  /** The display label for the link */
  label?: string
  /** Network badge to show (testnet/mainnet) */
  network?: StellarNetwork
  /** Additional CSS classes */
  className?: string
  /** Whether to show the external link icon */
  showIcon?: boolean
  /** Size variant */
  size?: 'sm' | 'md' | 'lg'
  /** Children to render inside the link (overrides label) */
  children?: React.ReactNode
}

/**
 * Base component for external explorer links.
 * Opens links in a new tab without disrupting the app session.
 */
export function ExplorerLink({
  href,
  label,
  network,
  className,
  showIcon = true,
  size = 'sm',
  children,
}: ExplorerLinkProps) {
  const sizeClasses = {
    sm: 'text-xs',
    md: 'text-sm',
    lg: 'text-base',
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        'inline-flex items-center gap-1 font-mono text-primary hover:text-primary/80 underline-offset-2 hover:underline transition-colors',
        sizeClasses[size],
        className
      )}
      onClick={(e) => {
        // Stop propagation to prevent parent click handlers from firing
        e.stopPropagation()
      }}
    >
      {children ?? label ?? href}
      {showIcon && <ExternalLink className="h-3 w-3 shrink-0" />}
      {network && network !== 'UNKNOWN' && (
        <span className="ml-1 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary/70 uppercase tracking-wider">
          {network === 'TESTNET' ? 'Testnet' : 'Mainnet'}
        </span>
      )}
    </a>
  )
}