"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import Link from "next/link";
import { Loader2, ChevronUp, ChevronDown, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NotificationItem } from "./notification-item";
import { type Notification } from "@/lib/notifications";

interface NotificationPanelProps {
  isOpen: boolean;
  onClose: () => void;
  unreadCount: number;
}

interface NotificationResponse {
  notifications: Notification[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}

const PAGE_SIZE = 10;

export function NotificationPanel({
  isOpen,
  onClose,
  unreadCount,
}: NotificationPanelProps) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [operationInProgress, setOperationInProgress] = useState<string | null>(
    null,
  );
  const panelRef = useRef<HTMLDivElement>(null);

  // Fetch notifications
  const fetchNotifications = useCallback(async (newOffset = 0) => {
    setIsLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        limit: PAGE_SIZE.toString(),
        offset: newOffset.toString(),
      });

      const response = await fetch(`/api/notifications?${params}`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      });

      if (!response.ok) {
        throw new Error("Failed to fetch notifications");
      }

      const data: NotificationResponse = await response.json();
      setNotifications(data.notifications);
      setTotal(data.pagination.total);
      setHasMore(data.pagination.hasMore);
      setOffset(newOffset);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Load notifications when panel opens
  useEffect(() => {
    if (isOpen) {
      fetchNotifications(0);
    }
  }, [isOpen, fetchNotifications]);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (
        panelRef.current &&
        !panelRef.current.contains(event.target as Node)
      ) {
        onClose();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen, onClose]);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  // Mark notification as read/unread
  const handleMarkAs = async (
    notificationId: string,
    action: "read" | "unread",
  ) => {
    setOperationInProgress(notificationId);

    try {
      const response = await fetch(`/api/notifications/${notificationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });

      if (!response.ok) {
        throw new Error(`Failed to mark notification as ${action}`);
      }

      // Update local state
      setNotifications((prevNotifications) =>
        prevNotifications.map((n) =>
          n.id === notificationId ? { ...n, isRead: action === "read" } : n,
        ),
      );

      // Refresh unread count (parent component should handle this)
      // For now, we just update the local state
    } catch (err) {
      console.error(err);
    } finally {
      setOperationInProgress(null);
    }
  };

  // Delete notification
  const handleDelete = async (notificationId: string) => {
    setOperationInProgress(notificationId);

    try {
      const response = await fetch(`/api/notifications/${notificationId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Failed to delete notification");
      }

      // Remove from local state
      setNotifications((prevNotifications) =>
        prevNotifications.filter((n) => n.id !== notificationId),
      );
      setTotal((prev) => Math.max(0, prev - 1));
    } catch (err) {
      console.error(err);
    } finally {
      setOperationInProgress(null);
    }
  };

  // Mark all as read
  const handleMarkAllAsRead = async () => {
    setIsLoading(true);

    try {
      const response = await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
      });

      if (!response.ok) {
        throw new Error("Failed to mark all as read");
      }

      // Update local state
      setNotifications((prevNotifications) =>
        prevNotifications.map((n) => ({
          ...n,
          isRead: true,
        })),
      );
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40" onClick={onClose} />

      {/* Panel */}
      <div
        ref={panelRef}
        className="absolute right-0 top-16 z-50 w-96 max-w-[calc(100vw-1rem)] bg-background border border-border rounded-lg shadow-lg"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border/40">
          <div>
            <h2 className="text-sm font-semibold">Notifications</h2>
            {unreadCount > 0 && (
              <p className="text-xs text-muted-foreground">
                {unreadCount} unread
              </p>
            )}
          </div>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleMarkAllAsRead}
              disabled={isLoading}
              className="text-xs"
            >
              Mark all read
            </Button>
          )}
        </div>

        {/* Content */}
        <div className="max-h-96 overflow-y-auto">
          {isLoading && notifications.length === 0 ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : error ? (
            <div className="flex items-center justify-center py-8">
              <p className="text-sm text-destructive">{error}</p>
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 px-4">
              <p className="text-sm text-muted-foreground text-center">
                No notifications yet
              </p>
            </div>
          ) : (
            <div>
              {notifications.map((notification) => (
                <NotificationItem
                  key={notification.id}
                  notification={notification}
                  onMarkAsRead={() => handleMarkAs(notification.id, "read")}
                  onMarkAsUnread={() => handleMarkAs(notification.id, "unread")}
                  onDelete={() => handleDelete(notification.id)}
                  isLoading={operationInProgress === notification.id}
                />
              ))}
            </div>
          )}
        </div>

        {/* Footer with pagination */}
        {total > 0 && (
          <div className="flex items-center justify-between p-3 border-t border-border/40 bg-muted/30">
            <p className="text-xs text-muted-foreground">
              {offset + 1}–{Math.min(offset + PAGE_SIZE, total)} of {total}
            </p>

            <div className="flex gap-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  fetchNotifications(Math.max(0, offset - PAGE_SIZE))
                }
                disabled={offset === 0 || isLoading}
                className="h-8 w-8 p-0"
              >
                <ChevronUp className="h-4 w-4" />
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={() => fetchNotifications(offset + PAGE_SIZE)}
                disabled={!hasMore || isLoading}
                className="h-8 w-8 p-0"
              >
                <ChevronDown className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* View All Link */}
        <Link href="/dashboard/notifications" onClick={onClose}>
          <div className="flex items-center justify-center gap-2 p-3 border-t border-border/40 bg-muted/20 hover:bg-muted/40 transition-colors text-sm font-medium text-primary cursor-pointer">
            View All Notifications
            <ArrowRight className="h-4 w-4" />
          </div>
        </Link>
      </div>
    </>
  );
}
