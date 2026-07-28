"use client";

import { Button } from "@/components/ui/button";
import { Wallet, LogOut } from "lucide-react";
import { useFreighter, truncateStellarAddress } from "@/lib/hooks/use-freighter";

export function WalletConnect() {
  const {
    address,
    isConnected,
    isConnecting,
    isInitializing,
    isWrongNetwork,
    network,
    error,
    connect,
    disconnect,
    clearError,
  } = useFreighter();

  if (isInitializing) {
    return (
      <Button variant="outline" disabled>
        <Wallet className="mr-2 h-4 w-4" />
        Loading…
      </Button>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-xs text-destructive max-w-[200px]">{error}</p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={connect} disabled={isConnecting}>
            {isConnecting ? "Connecting…" : "Retry"}
          </Button>
          <Button variant="ghost" size="sm" onClick={clearError}>
            Dismiss
          </Button>
        </div>
      </div>
    );
  }

  if (isConnected && address) {
    return (
      <div className="flex items-center gap-2">
        {isWrongNetwork && (
          <span className="text-xs text-destructive">Wrong network ({network})</span>
        )}
        <span className="text-sm text-muted-foreground font-mono">
          {truncateStellarAddress(address)}
        </span>
        <Button variant="ghost" size="icon" onClick={disconnect} title="Disconnect Wallet">
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  return (
    <Button onClick={connect} disabled={isConnecting} variant="outline">
      <Wallet className="mr-2 h-4 w-4" />
      {isConnecting ? "Connecting…" : "Connect Wallet"}
    </Button>
  );
}
