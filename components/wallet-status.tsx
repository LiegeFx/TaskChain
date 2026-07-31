"use client";

import { useState, useEffect, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { Wallet, Wifi, WifiOff } from "lucide-react";
import {
  isConnected,
  getAddress,
  getNetwork,
} from "@stellar/freighter-api";
import { WalletAddress } from "@/components/stellar";

type NetworkType = "PUBLIC" | "TESTNET" | "UNKNOWN";

type WalletStatusState = {
  connected: boolean;
  publicKey: string | null;
  network: NetworkType;
};

export function WalletStatus() {
  const [walletState, setWalletState] = useState<WalletStatusState>({
    connected: false,
    publicKey: null,
    network: "UNKNOWN",
  });

  const checkWalletStatus = useCallback(async () => {
    try {
      const connected = await isConnected();

      if (connected) {
        const { address, error: addressError } = await getAddress();
        const { network, error: networkError } = await getNetwork();

        if (!addressError && address) {
          setWalletState({
            connected: true,
            publicKey: address,
            network: (network as NetworkType) || "UNKNOWN",
          });
        }
      } else {
        setWalletState({
          connected: false,
          publicKey: null,
          network: "UNKNOWN",
        });
      }
    } catch {
      setWalletState({
        connected: false,
        publicKey: null,
        network: "UNKNOWN",
      });
    }
  }, []);

  useEffect(() => {
    const interval = setInterval(checkWalletStatus, 3000);

    return () => clearInterval(interval);
  }, [checkWalletStatus]);

  const getNetworkBadgeVariant = (network: NetworkType) => {
    switch (network) {
      case "PUBLIC":
        return "default";
      case "TESTNET":
        return "secondary";
      default:
        return "outline";
    }
  };

  const getNetworkLabel = (network: NetworkType): string => {
    switch (network) {
      case "PUBLIC":
        return "Mainnet";
      case "TESTNET":
        return "Testnet";
      default:
        return "Unknown";
    }
  };

  if (!walletState.connected || !walletState.publicKey) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-background">
        <WifiOff className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm text-muted-foreground">Disconnected</span>
        <Badge variant="outline" className="ml-2">
          No Wallet
        </Badge>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-background">
      <Wifi className="h-4 w-4 text-green-500" />
      <Wallet className="h-4 w-4 text-foreground" />
      <WalletAddress
        address={walletState.publicKey}
        network={walletState.network}
        showCopy
        showExplorerLink
        size="sm"
      />
      <Badge variant={getNetworkBadgeVariant(walletState.network)}>
        {getNetworkLabel(walletState.network)}
      </Badge>
    </div>
  );
}