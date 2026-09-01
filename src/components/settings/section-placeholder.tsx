"use client";

import type { LucideIcon } from "lucide-react";

/**
 * Elegant placeholder for settings sections that aren't wired up yet.
 * It is intentionally read-only and says so — no fake controls.
 */
export function SectionPlaceholder({
  title,
  description,
  icon: Icon,
}: {
  title: string;
  description: string;
  icon: LucideIcon;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed bg-muted/20 px-6 py-16 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-accent">
        <Icon className="size-6 text-muted-foreground" />
      </div>
      <h3 className="mt-4 text-lg font-medium">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>
      <span className="mt-6 rounded-full border bg-background px-3 py-1 text-xs font-medium text-muted-foreground">
        Not available yet
      </span>
    </div>
  );
}
