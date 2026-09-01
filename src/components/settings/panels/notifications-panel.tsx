"use client";

import { Bell } from "lucide-react";
import { SectionPlaceholder } from "@/components/settings/section-placeholder";

export function NotificationsPanel() {
  return (
    <SectionPlaceholder
      icon={Bell}
      title="Notifications"
      description="Notification preferences aren't wired up yet."
    />
  );
}
