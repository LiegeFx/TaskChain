"use client";

import { Check, CheckCheck, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { type Notification } from "@/lib/notifications";

// ─── Utility functions ─────────────────────────────────────────────────────

function formatTimeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;

  // For older notifications, show the date
  return date.toLocaleDateString();
}

// ─── Notification type icons and labels ────────────────────────────────────

const NOTIFICATION_CONFIG: Record<
  string,
  {
    icon: React.ReactNode;
    color: string;
    label: string;
    description: (payload: Record<string, unknown>) => string;
  }
> = {
  milestone_approved: {
    icon: "✓",
    color:
      "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300",
    label: "Milestone Approved",
    description: (payload) =>
      `Milestone "${(payload.milestoneName as string) || "Unnamed"}" has been approved`,
  },
  funds_released: {
    icon: "💰",
    color: "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300",
    label: "Funds Released",
    description: (payload) =>
      `${(payload.amount as string) || "Funds"} has been released to your account`,
  },
  contract_created: {
    icon: "📋",
    color:
      "bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300",
    label: "Contract Created",
    description: (payload) =>
      `New contract "${(payload.contractName as string) || "Untitled"}" created`,
  },
  dispute_raised: {
    icon: "⚠️",
    color: "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300",
    label: "Dispute Raised",
    description: (payload) =>
      `A dispute has been raised: ${(payload.reason as string) || "See details for more"}`,
  },
  escrow_funded: {
    icon: "🔒",
    color:
      "bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300",
    label: "Escrow Funded",
    description: (payload) =>
      `Escrow has been funded with ${(payload.amount as string) || "funds"}`,
  },
  payment_released: {
    icon: "✓",
    color:
      "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300",
    label: "Payment Released",
    description: (payload) =>
      `Payment of ${(payload.amount as string) || "funds"} has been released`,
  },
};

interface NotificationItemProps {
  notification: Notification;
  onMarkAsRead?: (id: string) => Promise<void>;
  onMarkAsUnread?: (id: string) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
  isLoading?: boolean;
}

export function NotificationItem({
  notification,
  onMarkAsRead,
  onMarkAsUnread,
  onDelete,
  isLoading = false,
}: NotificationItemProps) {
  const config = NOTIFICATION_CONFIG[notification.type] || {
    icon: "•",
    color: "bg-gray-100 dark:bg-gray-900/30 text-gray-700 dark:text-gray-300",
    label: notification.type,
    description: (payload) => JSON.stringify(payload),
  };

  const timeAgo = formatTimeAgo(notification.createdAt);

  return (
    <div
      className={`group flex gap-3 p-3 border-b border-border/40 hover:bg-muted/50 transition-colors ${
        !notification.isRead ? "bg-muted/30" : ""
      }`}
    >
      {/* Icon */}
      <div
        className={`flex-shrink-0 h-8 w-8 rounded-lg flex items-center justify-center text-sm ${config.color}`}
      >
        {config.icon}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p
              className={`text-sm font-semibold truncate ${!notification.isRead ? "text-foreground" : "text-muted-foreground"}`}
            >
              {config.label}
            </p>
            <p className="text-xs text-muted-foreground line-clamp-2">
              {config.description(notification.payload)}
            </p>
            <p className="text-xs text-muted-foreground/70 mt-1">{timeAgo}</p>
          </div>

          {/* Unread indicator dot */}
          {!notification.isRead && (
            <div className="flex-shrink-0 h-2 w-2 rounded-full bg-primary mt-1" />
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex-shrink-0 flex gap-1 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
        {!notification.isRead ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onMarkAsRead?.(notification.id)}
            disabled={isLoading}
            className="h-6 w-6 p-0"
            title="Mark as read"
          >
            <Check className="h-3.5 w-3.5" />
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onMarkAsUnread?.(notification.id)}
            disabled={isLoading}
            className="h-6 w-6 p-0"
            title="Mark as unread"
          >
            <CheckCheck className="h-3.5 w-3.5" />
          </Button>
        )}

        <Button
          variant="ghost"
          size="sm"
          onClick={() => onDelete?.(notification.id)}
          disabled={isLoading}
          className="h-6 w-6 p-0 text-destructive hover:text-destructive"
          title="Delete"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
