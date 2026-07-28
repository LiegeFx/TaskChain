"use client";

import { Star, ShieldCheck, User, Calendar } from "lucide-react";
import { cn } from "@/lib/utils";

export interface Review {
  id: number;
  contractId: number;
  reviewerId: number;
  reviewerName: string;
  reviewerAvatar?: string;
  freelancerId: number;
  freelancerName: string;
  rating: number;
  comment?: string;
  verified: boolean;
  createdAt: string;
}

function RatingStars({ rating, size = "sm", interactive = false }: {
  rating: number;
  size?: "sm" | "md" | "lg";
  interactive?: boolean;
}) {
  const sizeConfig: Record<string, string> = {
    sm: "h-4 w-4",
    md: "h-5 w-5",
    lg: "h-6 w-6",
  };
  const stars = [];

  for (let i = 0; i < 5; i++) {
    const filled = interactive ? i < rating : i < Math.floor(rating);
    stars.push(
      <Star
        key={i}
        className={cn(
          sizeConfig[size],
          filled ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40"
        )}
      />
    );
  }

  return (
    <div className="flex items-center gap-1">
      {stars}
      {!interactive && rating > 0 && (
        <span className="ml-1 text-xs font-medium text-foreground">
          {rating.toFixed(1)}
        </span>
      )}
    </div>
  );
}

export function ReviewCard({ review }: { review: Review }) {
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  return (
    <article className="group rounded-xl border border-border/60 bg-card/50 p-5 backdrop-blur-sm transition-all duration-300 hover:border-border/80 hover:bg-card/70">
      <header className="mb-4 flex items-start justify-between">
        <div className="flex items-start gap-3">
          {review.reviewerAvatar ? (
            <img
              src={review.reviewerAvatar}
              alt={review.reviewerName}
              className="h-10 w-10 rounded-full object-cover border border-border/50"
            />
          ) : (
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted/50 border border-border/50">
              <User className="h-5 w-5 text-muted-foreground" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="font-semibold text-foreground truncate">
                {review.reviewerName}
              </p>
              {review.verified && (
                <span className="flex items-center gap-1 text-xs text-emerald-400 font-medium">
                  <ShieldCheck className="h-3.5 w-3.5" /> Verified
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
              <Calendar className="h-3.5 w-3.5" />
              <span>{formatDate(review.createdAt)}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <RatingStars rating={review.rating} size="md" />
        </div>
      </header>

      {review.comment && (
        <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
          {review.comment}
        </p>
      )}

      <footer className="mt-4 flex items-center justify-between border-t border-border/40 pt-4">
        <div className="text-xs text-muted-foreground">
          Contract #{review.contractId}
        </div>
      </footer>
    </article>
  );
}