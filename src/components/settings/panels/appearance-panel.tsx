"use client";

import { Palette } from "lucide-react";
import { SettingsCard } from "@/components/settings/settings-card";
import { ThemeSwitcher } from "@/components/settings/theme-switcher";

export function AppearancePanel() {
  return (
    <div className="space-y-5">
      <SettingsCard title="Theme">
        <p className="text-sm text-muted-foreground">
          Choose between light and dark mode for your workspace. Your selection
          is saved locally on this device.
        </p>
        <div className="mt-4">
          <ThemeSwitcher />
        </div>
      </SettingsCard>

      <SettingsCard title="Appearance">
        <div className="flex items-start gap-3 text-muted-foreground">
          <Palette className="mt-0.5 size-5" />
          <p className="text-sm">
            Additional display preferences are coming soon.
          </p>
        </div>
      </SettingsCard>
    </div>
  );
}
