"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "theme";

function getSystemDark(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
}

export function ThemeSwitcher() {
  const [mounted, setMounted] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    let next: "light" | "dark";
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      next = stored === "dark" ? "dark" : stored === "light" ? "light" : getSystemDark() ? "dark" : "light";
    } catch {
      next = getSystemDark() ? "dark" : "light";
    }
    setTheme(next);
    document.documentElement.classList.toggle("dark", next === "dark");
    setMounted(true);
  }, []);

  const apply = (next: "light" | "dark") => {
    setTheme(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
    document.documentElement.classList.toggle("dark", next === "dark");
  };

  if (!mounted) {
    return (
      <div className="inline-flex rounded-lg border bg-background p-1">
        <div className="h-8 w-16 rounded-md" />
        <div className="h-8 w-16 rounded-md" />
      </div>
    );
  }

  return (
    <div className="inline-flex items-center gap-1 rounded-lg border bg-background p-1">
      <button
        type="button"
        onClick={() => apply("light")}
        className={cn(
          "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
          theme === "light"
            ? "bg-accent text-accent-foreground"
            : "text-muted-foreground hover:text-foreground"
        )}
      >
        <Sun className="size-4" />
        Light
      </button>
      <button
        type="button"
        onClick={() => apply("dark")}
        className={cn(
          "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
          theme === "dark"
            ? "bg-accent text-accent-foreground"
            : "text-muted-foreground hover:text-foreground"
        )}
      >
        <Moon className="size-4" />
        Dark
      </button>
    </div>
  );
}
