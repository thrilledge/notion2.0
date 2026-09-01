"use client";

import { Lock } from "lucide-react";
import { SectionPlaceholder } from "@/components/settings/section-placeholder";

export function SecurityPanel() {
  return (
    <SectionPlaceholder
      icon={Lock}
      title="Security"
      description="Authentication is handled by your sign-in provider. Account security controls aren't available here yet."
    />
  );
}
