"use client";

import { Clock, CheckCircle2, Star } from "lucide-react";
import { cn } from "@/lib/utils";

export interface AverageScoreDisplayProps {
  reviewCount: number;
  averageRating: number;
  lastUpdated?: string;
  verifiedCount?: number;
  className?: string;
}

export function ReviewsSummary({ reviewCount, averageRating, lastUpdated, verifiedCount, className }: AverageScoreDisplayProps) {
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const ratingColor = (rating: number) => {
    if (rating >= 4.5) return "text-emerald-400";
    if (rating >= 4.0) return "text-green-400";
    if (rating >= 3.5) return "text-lime-400";
    if (rating >= 3.0) return "text-yellow-400";
    if (rating >= 2.0) return "text-orange-400";
    return "text-destructive";
  };

  return (
    <div className={cn("rounded-2xl border border-border/60 bg-card/50 p-5 backdrop-blur-sm", className)}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-foreground">Reviews Summary</h3>
        {lastUpdated && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="h-3.5 w-3.5" />
            <span>Updated {formatDate(lastUpdated)}</span>
          </div>
        )}
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Star className="h-5 w-5 fill-amber-400 text-amber-400" />
            <span className="text-sm text-muted-foreground">Average Rating</span>
          </div>
          <div className={cn("text-xl font-bold", ratingColor(averageRating))}>.
            {averageRating.toFixed(1)}
          </div>
        </div>

        <div className="h-px bg-border/40" />

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              <span className="text-sm text-muted-foreground">Verified Reviews</span>
            </div>
            <span className="font-medium text-foreground">
              {verifiedCount || 0} of {reviewCount}
            </span>
          </div>

          {verifiedCount !== undefined && verifiedCount < reviewCount && (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="h-4 w-4 rounded-full border border-muted-foreground/30" />
                <span className="text-sm text-muted-foreground">Unverified</span>
              </div>
              <span className="font-medium text-foreground">
                {reviewCount - (verifiedCount || 0)}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}