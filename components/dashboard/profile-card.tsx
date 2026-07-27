"use client";

import { Star, User, Wallet } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

export interface ProfileInfo {
  display_name: string | null;
  username: string;
  avatar_url: string | null;
  wallet_address: string | null;
  avg_rating?: number;
  total_reviews?: number;
}

interface ProfileCardProps {
  type: "client" | "freelancer";
  profile: ProfileInfo | null;
  badge?: React.ReactNode;
  emptyMessage?: string;
}

export function ProfileCard({
  type,
  profile,
  badge,
  emptyMessage = "No profile information available",
}: ProfileCardProps) {
  const Icon = type === "client" ? User : User;
  const roleLabel = type === "client" ? "Client" : "Freelancer";

  return (
    <Card className="p-5 bg-card/50 border-border/40 backdrop-blur-sm rounded-xl space-y-4 hover:border-border/80 transition-colors">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <Icon className="h-4 w-4 text-primary" />
          {roleLabel}
        </span>
        {badge}
      </div>

      {profile ? (
        <>
          <div className="flex items-center gap-4">
            {profile.avatar_url ? (
              <img
                src={profile.avatar_url}
                alt={profile.display_name || profile.username}
                className="w-12 h-12 rounded-full object-cover border border-border/50"
              />
            ) : (
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center border border-border/50 text-primary">
                <User className="h-6 w-6" />
              </div>
            )}

            <div className="min-w-0 flex-1">
              <p className="font-bold text-lg leading-tight truncate">
                {profile.display_name || "Anonymous User"}
              </p>
              <p className="text-sm text-muted-foreground leading-normal truncate">
                @{profile.username}
              </p>
            </div>
          </div>

          {type === "freelancer" &&
            profile.avg_rating !== undefined &&
            profile.total_reviews !== undefined && (
              <div className="flex items-center gap-1 text-sm bg-muted/30 w-fit px-2.5 py-1 rounded-md">
                <Star className="h-4 w-4 fill-amber-400 text-amber-400 shrink-0" />
                <span className="font-semibold text-foreground">
                  {Number(profile.avg_rating).toFixed(1)}
                </span>
                <span className="text-muted-foreground text-xs">
                  ({profile.total_reviews} reviews)
                </span>
              </div>
            )}

          {profile.wallet_address && (
            <div className="pt-2 border-t border-border/20 flex items-center gap-2 text-xs text-muted-foreground font-mono">
              <Wallet className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="truncate" title={profile.wallet_address}>
                {profile.wallet_address}
              </span>
            </div>
          )}
        </>
      ) : (
        <div className="flex flex-col items-center justify-center py-6 text-center">
          <User className="h-8 w-8 text-muted-foreground/40 mb-2" />
          <p className="font-semibold text-sm">{emptyMessage}</p>
        </div>
      )}
    </Card>
  );
}