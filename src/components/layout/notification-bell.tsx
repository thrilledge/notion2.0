"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { Bell, CheckCheck, Loader2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  useNotifications,
  useMarkNotificationRead,
  useMarkAllRead,
} from "@/hooks/use-notifications";

const TYPE_LABEL: Record<string, string> = {
  assignment: "Assigned",
  comment: "Comment",
  due: "Due soon",
  system: "System",
};

export function NotificationBell() {
  const { data, isLoading } = useNotifications(40);
  const markRead = useMarkNotificationRead();
  const markAll = useMarkAllRead();

  const notifications = data?.data ?? [];
  const unread = data?.meta.unread ?? 0;

  // Track notification ids already seen so we can fire browser notifications
  // for newly created ones while the page is open.
  const seenRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!notifications.length) return;
    for (const n of notifications) seenRef.current.add(n.id);
  }, [notifications]);

  useEffect(() => {
    if (isLoading) return;
    const fresh = notifications.filter((n) => !seenRef.current.has(n.id) && !n.readAt);
    if (fresh.length === 0) return;
    for (const n of fresh) seenRef.current.add(n.id);
    if (!("Notification" in window) || Notification.permission !== "granted") {
      return;
    }
    for (const n of fresh) {
      try {
        new Notification(n.title, {
          body: n.body ?? "",
          tag: n.id,
        });
      } catch {
        /* ignore */
      }
    }
  }, [notifications, isLoading]);

  const requestPermission = () => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }
  };

  const openNotification = (n: (typeof notifications)[number]) => {
    requestPermission();
    if (!n.readAt) markRead.mutate(n.id);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="Notifications">
          <Bell className="size-5" />
          {unread > 0 && (
            <span className="absolute right-1.5 top-1.5 flex size-4 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel className="flex items-center justify-between">
          <span className="text-sm">Notifications</span>
          {unread > 0 && (
            <button
              onClick={() => markAll.mutate()}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <CheckCheck className="size-3.5" />
              Mark all read
            </button>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {isLoading && (
          <div className="flex justify-center py-6">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        )}
        {!isLoading && notifications.length === 0 && (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">
            No notifications
          </p>
        )}
        {!isLoading &&
          notifications.slice(0, 20).map((n) => (
            <DropdownMenuItem
              key={n.id}
              className="block py-0"
              onClick={() => openNotification(n)}
            >
              <Link href={n.link ?? "/"} className="block px-1 py-2">
                <div className="flex items-start gap-2">
                  <span
                    className={cn(
                      "mt-1.5 size-2 shrink-0 rounded-full",
                      n.readAt ? "bg-muted-foreground/30" : "bg-destructive"
                    )}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium">
                        {n.title}
                      </span>
                      <span className="shrink-0 text-[10px] uppercase text-muted-foreground">
                        {TYPE_LABEL[n.type] ?? n.type}
                      </span>
                    </div>
                    {n.body && (
                      <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                        {n.body}
                      </p>
                    )}
                    <p className="mt-1 text-[10px] text-muted-foreground/70">
                      {formatDistanceToNow(new Date(n.createdAt), {
                        addSuffix: true,
                      })}
                    </p>
                  </div>
                </div>
              </Link>
            </DropdownMenuItem>
          ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
