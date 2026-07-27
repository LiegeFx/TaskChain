"use client";

import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { ReviewCard } from "@/components/ui/review-card";

interface ReviewListResponse {
  data: {
    id: number;
    contract_id: number;
    reviewer_id: number;
    reviewer_name: string;
    reviewer_avatar?: string;
    freelancer_id: number;
    freelancer_name: string;
    rating: number;
    comment?: string;
    verified: boolean;
    created_at: string;
  }[];
  meta: {
    totalCount: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

function LoadingReviews() {
  return (
    <div className="flex items-center justify-center py-12">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );
}

function EmptyReviews() {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-card/30 p-12 text-center">
      <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted/30">
        <Loader2 className="h-8 w-8 text-muted-foreground/40" />
      </div>
      <h3 className="text-xl font-semibold text-foreground">No reviews yet</h3>
      <p className="mt-2 text-muted-foreground">Be the first to leave a review!</p>
    </div>
  );
}

export interface ReviewsListProps {
  freelancerId: number;
  initialData?: ReviewListResponse;
  className?: string;
}

export function ReviewsList({ freelancerId, initialData, className }: ReviewsListProps) {
  const [data, setData] = useState<ReviewListResponse | undefined>(initialData);
  const [loading, setLoading] = useState(!initialData);
  const [page, setPage] = useState(initialData?.meta.page || 1);
  const [hasMore, setHasMore] = useState(
    initialData ? initialData.meta.page < initialData.meta.totalPages : true
  );

  const loadMore = async () => {
    if (loading || !hasMore) return;

    setLoading(true);
    try {
      const response = await fetch(
        `/api/reviews/${freelancerId}?page=${page + 1}&limit=10`
      );

      if (!response.ok) {
        throw new Error("Failed to load more reviews");
      }

      const newData = (await response.json()) as ReviewListResponse;

      if (newData.data.length > 0) {
        setData((prev) => {
          if (!prev) return newData;

          return {
            data: [...prev.data, ...newData.data],
            meta: newData.meta,
          };
        });

        setPage((prev) => prev + 1);
        setHasMore(page + 1 < newData.meta.totalPages);
      } else {
        setHasMore(false);
      }
    } catch (error) {
      console.error("Error loading more reviews:", error);
    } finally {
      setLoading(false);
    }
  };

  const reviews: any[] = data?.data || [];
  const hasReviews = reviews.length > 0;

  return (
    <div className={cn("space-y-6", className)}>
      {loading && page === 1 ? (
        <LoadingReviews />
      ) : !hasReviews ? (
        <EmptyReviews />
      ) : (
        <div className="space-y-4">
          {reviews.map((review) => (
            <ReviewCard
              key={review.id}
              review={{
                id: review.id,
                contractId: review.contract_id,
                reviewerId: review.reviewer_id,
                reviewerName: review.reviewer_name,
                reviewerAvatar: review.reviewer_avatar,
                freelancerId: review.freelancer_id,
                freelancerName: review.freelancer_name,
                rating: review.rating,
                comment: review.comment,
                verified: review.verified,
                createdAt: review.created_at,
              }}
            />
          ))}

          {hasMore && (
            <div className="flex justify-center pt-4">
              <button
                onClick={loadMore}
                disabled={loading}
                className="flex items-center gap-2 rounded-lg border border-border bg-card/50 px-6 py-3 text-sm font-medium text-foreground transition-colors hover:bg-card/70 disabled:opacity-50"
              >
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                Load more reviews
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}