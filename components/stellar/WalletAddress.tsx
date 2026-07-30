'use client'

import { useState, useCallback } from 'react'
import { Copy, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  getAccountUrl,
  truncateAddress,
  copyToClipboard,
} from '@/lib/stellar/explorer'
import { ExplorerLink } from './ExplorerLink'
import type { StellarNetwork } from '@/components/wallet-provider'

export interface WalletAddressProps {
  /** The full wallet address (Stellar public key G... or C...) */
  address: string
  /** The network environment */
  network: StellarNetwork
  /** Whether to show the copy button */
  showCopy?: boolean
  /** Whether to show the explorer link */
  showExplorerLink?: boolean
  /** Additional CSS classes */
  className?: string
  /** Size variant */
  size?: 'sm' | 'md' | 'lg'
  /** Optional label to display before the address */
  label?: string
  /** Callback when the address is copied to clipboard */
  onCopy?: () => void
}

/**
 * Displays a wallet address with a clickable link to Stellar Explorer
 * and optional copy-to-clipboard functionality.
 *
 * @example
 * ```tsx
 * <WalletAddress
 *   address="GABCDEF1234567890XYZ..."
 *   network="TESTNET"
 *   showCopy
 *   showExplorerLink
 * />
 * ```
 */
export function WalletAddress({
  address,
  network,
  showCopy = true,
  showExplorerLink = true,
  className,
  size = 'sm',
  label,
  onCopy,
}: WalletAddressProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(async () => {
    const success = await copyToClipboard(address)
    if (success) {
      setCopied(true)
      onCopy?.()
      setTimeout(() => setCopied(false), 2000)
    }
  }, [address, onCopy])

  const explorerUrl = showExplorerLink ? getAccountUrl(address, network) : undefined

  const sizeClasses = {
    sm: 'text-xs',
    md: 'text-sm',
    lg: 'text-base',
  }

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 font-mono',
        sizeClasses[size],
        className
      )}
    >
      {/* Optional label */}
      {label && (
        <span className="text-muted-foreground/70 font-sans">{label}:</span>
      )}

      {/* Explorer link */}
      {explorerUrl ? (
        <ExplorerLink
          href={explorerUrl}
          network={network}
          showIcon={true}
          size={size}
          aria-label={`View wallet on Stellar Explorer`}
        >
          <span title={address}>{truncateAddress(address)}</span>
        </ExplorerLink>
      ) : (
        <span className="text-muted-foreground" title={address}>
          {truncateAddress(address)}
        </span>
      )}

      {/* Copy to clipboard button */}
      {showCopy && (
        <button
          type="button"
          onClick={handleCopy}
          className={cn(
            'inline-flex items-center justify-center rounded p-0.5 transition-colors',
            copied
              ? 'text-accent hover:text-accent/80'
              : 'text-muted-foreground/50 hover:text-muted-foreground'
          )}
          title={copied ? 'Copied!' : 'Copy wallet address to clipboard'}
          aria-label={copied ? 'Copied' : 'Copy wallet address'}
        >
          {copied ? (
            <Check className="h-3.5 w-3.5" />
          ) : (
            <Copy className="h-3.5 w-3.5" />
          )}
        </button>
      )}
    </span>
  )
}