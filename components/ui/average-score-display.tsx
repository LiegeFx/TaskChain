"use client";

import { Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { ReviewCard } from "@/components/ui/review-card";

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

export interface AverageScoreDisplayProps {
  reviews: Review[];
  className?: string;
  showCount?: boolean;
  size?: "sm" | "md" | "lg";
}

export function AverageScoreDisplay({
  reviews,
  className,
  showCount = true,
  size = "md",
}: AverageScoreDisplayProps) {
  const sizeConfig = {
    sm: {
      container: "px-3 py-1.5 rounded-lg",
      star: "h-3.5 w-3.5",
      text: "text-sm",
      value: "text-base",
    },
    md: {
      container: "px-4 py-2 rounded-xl",
      star: "h-5 w-5",
      text: "text-base",
      value: "text-lg",
    },
    lg: {
      container: "px-5 py-3 rounded-2xl",
      star: "h-6 w-6",
      text: "text-lg",
      value: "text-xl",
    },
  };

  const config = sizeConfig[size];

  if (reviews.length === 0) {
    return (
      <div className={cn("text-center text-muted-foreground", config.text)}>
        No reviews available
      </div>
    );
  }

  const averageRating = reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length;
  const maxRating = 5;

  const getRatingColor = (rating: number) => {
    if (rating >= 4.5) return "text-emerald-400";
    if (rating >= 4.0) return "text-green-400";
    if (rating >= 3.5) return "text-lime-400";
    if (rating >= 3.0) return "text-yellow-400";
    if (rating >= 2.0) return "text-orange-400";
    return "text-destructive";
  };

  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 bg-card/50 border border-border/60 rounded-xl",
        config.container,
        className
      )}
    >
      <div className="flex items-center gap-1">
        <Star className={cn("fill-current", config.star, getRatingColor(averageRating))} />
        <span className={cn("font-bold", config.value, getRatingColor(averageRating))}>
          {averageRating.toFixed(1)}
        </span>
      </div>

      {showCount && (
        <span className={cn("text-muted-foreground", config.text)}>
          ({reviews.length} review{reviews.length !== 1 ? "s" : ""})
        </span>
      )}
    </div>
  );
}