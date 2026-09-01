"use client";

import { Palette } from "lucide-react";
import { SectionPlaceholder } from "@/components/settings/section-placeholder";

export function AppearancePanel() {
  return (
    <SectionPlaceholder
      icon={Palette}
      title="Appearance"
      description="Theme and display preferences for your workspace aren't wired up yet."
    />
  );
}
