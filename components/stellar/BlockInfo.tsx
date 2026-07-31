'use client'

import { Blocks } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getLedgerUrl } from '@/lib/stellar/explorer'
import { ExplorerLink } from './ExplorerLink'
import type { StellarNetwork } from '@/components/wallet-provider'

export interface BlockInfoProps {
  /** The ledger sequence number */
  ledgerSeq: number | string
  /** The network environment */
  network: StellarNetwork
  /** Additional CSS classes */
  className?: string
  /** Size variant */
  size?: 'sm' | 'md' | 'lg'
  /** Optional label to display before the block info */
  label?: string
  /** Whether to show the explorer link */
  showExplorerLink?: boolean
  /** Whether to show the block icon */
  showIcon?: boolean
  /** Optional timestamp to display alongside the block */
  timestamp?: string
}

/**
 * Displays block/ledger information with a direct reference link
 * to Stellar Explorer.
 *
 * @example
 * ```tsx
 * <BlockInfo
 *   ledgerSeq={12345678}
 *   network="TESTNET"
 *   label="Ledger"
 *   timestamp="2025-10-24T12:00:00Z"
 * />
 * ```
 */
export function BlockInfo({
  ledgerSeq,
  network,
  className,
  size = 'sm',
  label,
  showExplorerLink = true,
  showIcon = true,
  timestamp,
}: BlockInfoProps) {
  const explorerUrl = showExplorerLink
    ? getLedgerUrl(ledgerSeq, network)
    : undefined

  const sizeClasses = {
    sm: 'text-xs',
    md: 'text-sm',
    lg: 'text-base',
  }

  const formattedTimestamp = timestamp
    ? new Date(timestamp).toLocaleString()
    : undefined

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5',
        sizeClasses[size],
        className
      )}
    >
      {/* Block icon */}
      {showIcon && (
        <Blocks className="h-3.5 w-3.5 text-muted-foreground/60 shrink-0" />
      )}

      {/* Optional label */}
      {label && (
        <span className="text-muted-foreground/70 font-sans">{label}:</span>
      )}

      {/* Explorer link or plain text */}
      {explorerUrl ? (
        <ExplorerLink
          href={explorerUrl}
          network={network}
          showIcon={true}
          size={size}
          aria-label={`View ledger ${ledgerSeq} on Stellar Explorer`}
        >
          <span className="font-mono" title={`Ledger ${ledgerSeq}`}>
            #{ledgerSeq}
          </span>
        </ExplorerLink>
      ) : (
        <span className="font-mono text-muted-foreground">#{ledgerSeq}</span>
      )}

      {/* Timestamp */}
      {formattedTimestamp && (
        <span className="text-muted-foreground/60 font-sans">
          {formattedTimestamp}
        </span>
      )}
    </span>
  )
}