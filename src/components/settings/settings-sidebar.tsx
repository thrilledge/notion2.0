"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Users,
  ShieldCheck,
  Building2,
  FolderKanban,
  Settings2,
  Palette,
  Bell,
  Lock,
} from "lucide-react";
import { cn } from "@/lib/utils";

const sections = [
  {
    slug: "general",
    label: "General",
    icon: Settings2,
  },
  {
    slug: "appearance",
    label: "Appearance",
    icon: Palette,
  },
  {
    slug: "members",
    label: "Members",
    icon: Users,
  },
  {
    slug: "access",
    label: "Access & Permissions",
    icon: ShieldCheck,
  },
  {
    slug: "workspaces",
    label: "Workspaces",
    icon: Building2,
  },
  {
    slug: "projects",
    label: "Projects",
    icon: FolderKanban,
  },
  {
    slug: "notifications",
    label: "Notifications",
    icon: Bell,
  },
  {
    slug: "security",
    label: "Security",
    icon: Lock,
  },
];

export function SettingsSidebar() {
  const pathname = usePathname();
  const active = pathname.split("/")[2] ?? "general";

  return (
    <nav className="w-full min-w-0">
      <p className="mb-3 px-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Settings
      </p>
      <ul className="space-y-0.5">
        {sections.map((section) => {
          const isActive = active === section.slug;
          return (
            <li key={section.slug}>
              <Link
                href={`/settings/${section.slug}`}
                className={cn(
                  "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors",
                  isActive
                    ? "bg-accent font-medium text-accent-foreground"
                    : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                )}
              >
                <section.icon className="size-4 shrink-0" />
                <span className="truncate">{section.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
