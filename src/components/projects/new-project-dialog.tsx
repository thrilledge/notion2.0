"use client";

import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCreateProject } from "@/hooks/use-projects";
import { useTeam } from "@/hooks/use-team";
import { PROJECT_TEMPLATES } from "@/lib/templates";
import { AssigneeAvatar } from "@/components/projects/inline-editors";
import { Check } from "lucide-react";

export function NewProjectDialog({
  type,
}: {
  type: "client" | "side_project";
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [summary, setSummary] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [templateId, setTemplateId] = useState<string>("none");
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const createProject = useCreateProject();
  const { data: team = [] } = useTeam();

  const template = useMemo(
    () => PROJECT_TEMPLATES.find((t) => t.id === templateId) ?? null,
    [templateId]
  );

  const reset = () => {
    setName("");
    setSummary("");
    setDueDate("");
    setTemplateId("none");
    setAssigneeIds([]);
  };

  const applyTemplate = (id: string) => {
    setTemplateId(id);
    const t = PROJECT_TEMPLATES.find((x) => x.id === id);
    if (t) {
      setSummary(t.summary);
    } else if (id === "none") {
      setSummary("");
    }
  };

  const toggleAssignee = (userId: string) => {
    setAssigneeIds((prev) =>
      prev.includes(userId)
        ? prev.filter((u) => u !== userId)
        : [...prev, userId]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    try {
      await createProject.mutateAsync({
        name: name.trim(),
        type,
        summary: summary.trim() || undefined,
        dueDate: dueDate ? new Date(dueDate).toISOString() : undefined,
        status: template?.defaultStatus ?? "not_started",
        result: template?.defaultResult ?? undefined,
        assigneeIds: assigneeIds.length > 0 ? assigneeIds : undefined,
      });
      toast.success(
        template
          ? `Project created from "${template.name}" template`
          : "Project created"
      );
      setOpen(false);
      reset();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create project");
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 size-4" />
          New Project
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Create new project</DialogTitle>
          <DialogDescription>
            Start from a template or begin with a blank{" "}
            {type === "client" ? "client project" : "side project"}.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Template</Label>
            <Select value={templateId} onValueChange={applyTemplate}>
              <SelectTrigger>
                <SelectValue placeholder="Blank project" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Blank project</SelectItem>
                {PROJECT_TEMPLATES.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.emoji} {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {template && (
              <p className="text-xs text-muted-foreground">{template.description}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Project name"
              required
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label>Assignees</Label>
            <div className="flex flex-wrap gap-2">
              {team.map((member) => {
                const active = assigneeIds.includes(member.id);
                return (
                  <button
                    key={member.id}
                    type="button"
                    onClick={() => toggleAssignee(member.id)}
                    className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-sm transition-colors ${
                      active
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-input bg-transparent text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <AssigneeAvatar
                      name={member.fullName}
                      url={member.avatarUrl ?? null}
                      className="size-5"
                    />
                    <span className="truncate">{member.fullName}</span>
                    {active && <Check className="size-3.5" />}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="summary">Summary</Label>
            <textarea
              id="summary"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="Brief description"
              rows={3}
              className="w-full resize-y rounded-md border border-input bg-transparent p-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="dueDate">Due date</Label>
            <Input
              id="dueDate"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={createProject.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={createProject.isPending || !name.trim()}>
              {createProject.isPending ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
