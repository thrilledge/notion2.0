"use client";

import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Copy, MoreHorizontal, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useProjectAction } from "@/hooks/use-projects";

export function ProjectActionsMenu({
  projectId,
  projectName,
  onTrashed,
}: {
  projectId: string;
  projectName: string;
  onTrashed?: (id: string) => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const action = useProjectAction();

  const [asOpen, setAsOpen] = useState(false);
  const [asName, setAsName] = useState("");

  const runAction = (
    kind: "trash" | "duplicate",
    opts?: { name?: string; goToNew?: boolean }
  ) => {
    action.mutate(
      { id: projectId, action: kind, name: opts?.name },
      {
        onSuccess: (res) => {
          if (kind === "trash") {
            toast.success("Moved to trash");
            onTrashed?.(projectId);
            if (pathname?.includes(`/projects/${projectId}`)) {
              router.push("/projects");
            }
          } else {
            toast.success("Duplicated");
            const newId = res?.data?.id;
            if (opts?.goToNew && newId) {
              router.push(`/projects/${newId}`);
            }
          }
        },
        onError: (e) =>
          toast.error(e instanceof Error ? e.message : "Action failed"),
      }
    );
  };

  const submitAs = () => {
    if (!asName.trim()) {
      toast.error("Name is required");
      return;
    }
    runAction("duplicate", { name: asName.trim(), goToNew: true });
    setAsName("");
    setAsOpen(false);
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            onClick={(e) => e.stopPropagation()}
            className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            title="More"
          >
            <MoreHorizontal className="size-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuItem onClick={() => runAction("trash")}>
            <Trash2 className="size-4" />
            Move to trash
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => runAction("duplicate")}>
            <Copy className="size-4" />
            Duplicate
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => {
              setAsName(`${projectName} copy`);
              setAsOpen(true);
            }}
          >
            <Plus className="size-4" />
            Duplicate as...
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={asOpen} onOpenChange={setAsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Duplicate project</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="dup-name">New name</Label>
            <Input
              id="dup-name"
              value={asName}
              onChange={(e) => setAsName(e.target.value)}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAsOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submitAs} disabled={action.isPending}>
              {action.isPending ? "Duplicating..." : "Duplicate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
