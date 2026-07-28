"use client";

import { useState, useCallback, useEffect } from "react";
import Link from "next/link";
import {
  Loader2,
  ChevronLeft,
  ChevronRight,
  Check,
  CheckCheck,
  Trash2,
  Filter,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { NotificationItem } from "@/components/dashboard/notification-item";
import { type Notification } from "@/lib/notifications";

interface NotificationResponse {
  notifications: Notification[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}

const PAGE_SIZE = 20;

export function NotificationsPageClient() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [filterBy, setFilterBy] = useState<"all" | "unread" | "read">("all");
  const [operationInProgress, setOperationInProgress] = useState<string | null>(
    null,
  );

  // Fetch notifications
  const fetchNotifications = useCallback(
    async (newOffset = 0, filter: "all" | "unread" | "read" = "all") => {
      setIsLoading(true);
      setError(null);

      try {
        const params = new URLSearchParams({
          limit: PAGE_SIZE.toString(),
          offset: newOffset.toString(),
        });

        if (filter === "unread") {
          params.append("isRead", "false");
        } else if (filter === "read") {
          params.append("isRead", "true");
        }

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
    },
    [],
  );

  // Load notifications on mount and when filter changes
  useEffect(() => {
    fetchNotifications(0, filterBy);
  }, [filterBy, fetchNotifications]);

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

  const handleFilterChange = (value: "all" | "unread" | "read") => {
    setFilterBy(value);
    setOffset(0);
  };

  const handlePreviousPage = () => {
    if (offset > 0) {
      fetchNotifications(Math.max(0, offset - PAGE_SIZE), filterBy);
    }
  };

  const handleNextPage = () => {
    if (hasMore) {
      fetchNotifications(offset + PAGE_SIZE, filterBy);
    }
  };

  return (
    <div className="max-w-6xl mx-auto">
      <div className="p-6 border-b border-border/40">
        <div className="flex items-center justify-between mb-4">
          <Link
            href="/dashboard"
            className="text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="h-4 w-4 inline mr-2" />
            Back to Dashboard
          </Link>
        </div>

        <h1 className="text-3xl font-bold">Notifications</h1>
        <p className="text-muted-foreground mt-1">
          {total > 0
            ? `${total} total notification${total !== 1 ? "s" : ""}`
            : "No notifications"}
        </p>
      </div>

      {/* Filter tabs */}
      <div className="border-b border-border/40 px-6 pt-4">
        <Tabs value={filterBy} onValueChange={handleFilterChange}>
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="unread">Unread</TabsTrigger>
            <TabsTrigger value="read">Read</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Content */}
      <div>
        {isLoading && notifications.length === 0 ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <div className="flex items-center justify-center py-16">
            <p className="text-destructive">{error}</p>
          </div>
        ) : notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 px-4">
            <div className="bg-muted/30 rounded-lg p-8 text-center">
              <p className="text-lg font-semibold">No notifications</p>
              <p className="text-sm text-muted-foreground mt-2">
                {filterBy === "unread"
                  ? "You're all caught up! No unread notifications."
                  : filterBy === "read"
                    ? "You haven't read any notifications yet."
                    : "No notifications to display."}
              </p>
            </div>
          </div>
        ) : (
          <>
            {/* Notifications list */}
            <div className="divide-y divide-border/40">
              {notifications.map((notification) => (
                <div
                  key={notification.id}
                  className="px-6 py-4 hover:bg-muted/30 transition-colors"
                >
                  <NotificationItem
                    notification={notification}
                    onMarkAsRead={() => handleMarkAs(notification.id, "read")}
                    onMarkAsUnread={() =>
                      handleMarkAs(notification.id, "unread")
                    }
                    onDelete={() => handleDelete(notification.id)}
                    isLoading={operationInProgress === notification.id}
                  />
                </div>
              ))}
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between p-6 border-t border-border/40 bg-muted/10">
              <p className="text-sm text-muted-foreground">
                Showing {offset + 1}–{Math.min(offset + PAGE_SIZE, total)} of{" "}
                {total}
              </p>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handlePreviousPage}
                  disabled={offset === 0 || isLoading}
                >
                  <ChevronLeft className="h-4 w-4 mr-2" />
                  Previous
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleNextPage}
                  disabled={!hasMore || isLoading}
                >
                  Next
                  <ChevronRight className="h-4 w-4 ml-2" />
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
