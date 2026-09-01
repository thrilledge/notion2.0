"use client";

import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useWorkspaces, type WorkspaceRow } from "@/hooks/use-admin";

export function SettingsCard({
  title,
  action,
  children,
  className,
}: {
  title: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("shadow-none", className)}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">{title}</CardTitle>
        {action}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export function WorkspacePicker({
  value,
  onChange,
  workspaces,
  placeholder,
}: {
  value: string;
  onChange: (id: string) => void;
  workspaces: WorkspaceRow[] | undefined;
  placeholder?: string;
}) {
  if (!workspaces) {
    return <Skeleton className="h-9 w-64" />;
  }
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-64">
        <SelectValue placeholder={placeholder ?? "Select workspace"} />
      </SelectTrigger>
      <SelectContent>
        {workspaces.map((w) => (
          <SelectItem key={w.id} value={w.id}>
            {w.name} ({w.memberCount})
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
