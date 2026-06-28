"use client";

import { CheckCircle2, Star } from "lucide-react";
import { cn } from "@/lib/utils";

export interface VerifiedReviewBadgeProps {
  verified: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function VerifiedReviewBadge({ verified, size = "md", className }: VerifiedReviewBadgeProps) {
  if (!verified) return null;

  const sizeConfig = {
    sm: {
      container: "px-2 py-0.5 rounded-full",
      icon: "h-3 w-3",
      text: "text-xs",
    },
    md: {
      container: "px-2.5 py-1 rounded-full",
      icon: "h-3.5 w-3.5",
      text: "text-xs",
    },
    lg: {
      container: "px-3 py-1.5 rounded-full",
      icon: "h-4 w-4",
      text: "text-sm",
    },
  };

  const config = sizeConfig[size];

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20",
        config.container,
        config.text,
        "font-medium",
        className
      )}
    >
      <CheckCircle2 className={config.icon} />
      <span>Verified</span>
    </div>
  );
}

export interface StarRatingProps {
  rating: number;
  size?: "sm" | "md" | "lg";
  showValue?: boolean;
  interactive?: boolean;
  onChange?: (rating: number) => void;
  className?: string;
}

export function StarRating({
  rating,
  size = "md",
  showValue = false,
  interactive = false,
  onChange,
  className,
}: StarRatingProps) {
  const sizeConfig = {
    sm: "h-4 w-4",
    md: "h-5 w-5",
    lg: "h-6 w-6",
  };

  return (
    <div className={cn("flex items-center gap-1", className)}>
      {Array.from({ length: 5 }, (_, index) => {
        const isFilled = interactive ? index < rating : index < Math.floor(rating);
        const isHalfFilled = interactive ? false : index + 0.5 === rating;

        return (
          <button
            key={index}
            type="button"
            className={cn(
              sizeConfig[size],
              isFilled || isHalfFilled
                ? "fill-amber-400 text-amber-400"
                : "text-muted-foreground/40",
              interactive && "transition-colors hover:text-amber-400"
            )}
            onClick={() => interactive && onChange && onChange(index + 1)}
            disabled={!interactive}
            aria-label={`${index + 1} star${interactive ? " (click to rate)" : ""}`}
          >
            <Star
              className={
                isFilled || isHalfFilled
                  ? sizeConfig[size]
                  : sizeConfig[size]
              }
            />
          </button>
        );
      })}

      {showValue && (
        <span className="ml-1 text-xs font-medium text-foreground">
          {rating.toFixed(1)}
        </span>
      )}
    </div>
  );
}