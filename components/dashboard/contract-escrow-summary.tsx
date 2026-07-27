import Link from "next/link";
import { ArrowLeft, ShieldCheck, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  EscrowStatusTracker,
  type EscrowStage,
} from "@/components/dashboard/escrow-status-tracker";

interface EscrowInfo {
  escrow_address: string | null;
  escrow_status: string;
  funded_at: string | null;
  funding_tx_hash: string | null;
  total_amount: string;
  funded_amount: number;
  released_amount: number;
  progress_percent: number;
  network_passphrase: string | null;
}

export function ContractEscrowSummary({
  escrow,
  currency,
  onBack,
}: {
  escrow: EscrowInfo | null;
  currency: string;
  onBack?: () => void;
}) {
  const escrowStage: EscrowStage =
    (escrow?.escrow_status as EscrowStage | undefined) ?? "Funded";

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        {onBack && (
          <Button variant="ghost" size="icon" onClick={onBack}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
        )}
        <h2 className="text-xl font-semibold tracking-tight">Escrow Details</h2>
      </div>

      <EscrowStatusTracker currentStage={escrowStage} />

      {escrow && (
        <Card className="p-6 bg-card/45 border-border/30 backdrop-blur-md rounded-xl space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h3 className="text-lg font-bold flex items-center gap-2 text-primary">
                <ShieldCheck className="h-5 w-5 text-accent shrink-0" />
                <span>
                  Escrow:{" "}
                  <span className="text-foreground capitalize">
                    {escrow.escrow_status.replace("_", " ")}
                  </span>
                </span>
              </h3>
              {escrow.escrow_address && (
                <p className="text-xs text-muted-foreground font-mono mt-1 break-all flex items-center gap-1.5">
                  <Wallet className="h-3.5 w-3.5 shrink-0" />
                  <span>Address: {escrow.escrow_address}</span>
                </p>
              )}
              {escrow.network_passphrase && (
                <p className="text-xs text-muted-foreground font-mono mt-1">
                  Network: {escrow.network_passphrase}
                </p>
              )}
            </div>
            <div className="text-left sm:text-right shrink-0">
              <span className="text-xs text-muted-foreground uppercase tracking-wider block">
                Total Locked
              </span>
              <span className="text-3xl font-extrabold text-accent">
                {escrow.total_amount} {currency}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground text-xs mb-1">Funded</p>
              <p className="font-semibold">
                {escrow.funded_amount.toLocaleString()} {currency}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs mb-1">Released</p>
              <p className="font-semibold">
                {escrow.released_amount.toLocaleString()} {currency}
              </p>
            </div>
          </div>

          {escrow.funding_tx_hash && (
            <p className="text-[11px] text-muted-foreground font-mono truncate">
              Funding Tx: <span className="text-foreground">{escrow.funding_tx_hash}</span>
            </p>
          )}

          {escrow.funded_at && (
            <p className="text-xs text-muted-foreground">
              Funded at: {new Date(escrow.funded_at).toLocaleString()}
            </p>
          )}
        </Card>
      )}

      {!escrow && (
        <Card className="p-6 bg-card/45 border-border/30 backdrop-blur-md rounded-xl text-center text-muted-foreground">
          No escrow information available for this contract.
        </Card>
      )}
    </div>
  );
}