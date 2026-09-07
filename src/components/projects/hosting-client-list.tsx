"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, Pencil, Trash2, Loader2, Plus, X } from "lucide-react";
import { toast } from "sonner";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  HostingAssigneeSelect,
  HostingCommentsInline,
  HostingDueDateInline,
  HostingResultInline,
} from "@/components/hosting/hosting-inline-editors";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  useHostingClients,
  useUpdateHostingClient,
  useCreateHostingClient,
  useDeleteHostingClient,
  type HostingInput,
} from "@/hooks/use-hosting";
import { useTeam } from "@/hooks/use-team";
import { NewHostingDialog } from "@/components/projects/new-hosting-dialog";
import type { HostingClient } from "@/lib/db/schema";

const HOSTING_RESULT_OPTIONS = [
  { value: "not_started", label: "Not started" },
  { value: "in_progress", label: "In progress" },
  { value: "stuck", label: "Stuck" },
  { value: "pending_review", label: "Pending for review" },
  { value: "company_work", label: "Company work" },
  { value: "upcoming_renewal", label: "Upcoming renewal" },
  { value: "done", label: "Done" },
] as const;

function EditHostingDialog({
  client,
  open,
  onOpenChange,
}: {
  client: HostingClient;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const update = useUpdateHostingClient();
  const [domain, setDomain] = useState(client.domain);
  const [clientName, setClientName] = useState(client.clientName ?? "");
  const [dueDate, setDueDate] = useState(
    client.dueDate ? new Date(client.dueDate).toISOString().split("T")[0] : ""
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!domain.trim()) return;
    const data: HostingInput = {
      domain: domain.trim(),
      clientName: clientName.trim() || null,
      dueDate: dueDate ? new Date(dueDate).toISOString() : null,
    };
    update.mutate(
      { id: client.id, data },
      {
        onSuccess: () => {
          toast.success("Hosting client updated");
          onOpenChange(false);
        },
        onError: (err) =>
          toast.error(err instanceof Error ? err.message : "Update failed"),
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit hosting client</DialogTitle>
          <DialogDescription>Update the client details.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="domain">Domain</Label>
            <Input
              id="domain"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="clientName">Client name</Label>
            <Input
              id="clientName"
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
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
              onClick={() => onOpenChange(false)}
              disabled={update.isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={update.isPending || !domain.trim()}
            >
              {update.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function QuickAddHostingRow() {
  const createClient = useCreateHostingClient();
  const { data: team = [] } = useTeam();

  const [domain, setDomain] = useState("");
  const [clientName, setClientName] = useState("");
  const [result, setResult] = useState<string>("not_started");
  const [comments, setComments] = useState("");
  const [due, setDue] = useState("");
  const [assigneeId, setAssigneeId] = useState<string>("");
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <TableRow className="hover:bg-transparent">
        <TableCell colSpan={7} className="py-2">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="flex w-full items-center gap-1.5 rounded px-2 py-1 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <Plus className="size-3.5" />
            Add client
          </button>
        </TableCell>
      </TableRow>
    );
  }

  const submit = () => {
    if (!domain.trim()) {
      toast.error("Domain is required");
      return;
    }
    const data: HostingInput = {
      domain: domain.trim(),
      clientName: clientName.trim() || null,
      result: result as
        | "company_work"
        | "not_started"
        | "stuck"
        | "pending_review"
        | "in_progress"
        | "upcoming_renewal"
        | "done",
      comments: comments.trim() ? comments.trim() : undefined,
      dueDate: due ? new Date(due).toISOString() : null,
      assigneeId: assigneeId || null,
    };
    createClient.mutate(
      { ...data },
      {
        onSuccess: () => {
          toast.success("Hosting client created");
          setDomain("");
          setClientName("");
          setResult("not_started");
          setComments("");
          setDue("");
          setAssigneeId("");
          setOpen(false);
        },
        onError: (e) => toast.error(e.message),
      }
    );
  };

  const inputCls =
    "w-full rounded-md border border-input bg-transparent px-2 py-1 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

  return (
    <TableRow className="bg-muted/30">
      <TableCell className="py-1.5">
        <input
          autoFocus
          value={domain}
          onChange={(e) => setDomain(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="example.com"
          className={inputCls}
        />
      </TableCell>
      <TableCell>
        <input
          value={clientName}
          onChange={(e) => setClientName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="Client name"
          className={inputCls}
        />
      </TableCell>
      <TableCell>
        <select
          value={result}
          onChange={(e) => setResult(e.target.value)}
          className={inputCls}
        >
          {HOSTING_RESULT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </TableCell>
      <TableCell>
        <select
          value={assigneeId}
          onChange={(e) => setAssigneeId(e.target.value)}
          className={inputCls}
        >
          <option value="">Unassigned</option>
          {team.map((m) => (
            <option key={m.id} value={m.id}>
              {m.fullName}
            </option>
          ))}
        </select>
      </TableCell>
      <TableCell className="max-w-[240px]">
        <input
          value={comments}
          onChange={(e) => setComments(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="Add comment"
          className={inputCls}
        />
      </TableCell>
      <TableCell>
        <input
          type="date"
          value={due}
          onChange={(e) => setDue(e.target.value)}
          className={inputCls}
        />
      </TableCell>
      <TableCell className="whitespace-nowrap">
        <div className="flex items-center gap-1">
          <Button
            type="button"
            size="xs"
            onClick={submit}
            disabled={createClient.isPending}
          >
            {createClient.isPending ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              "Add"
            )}
          </Button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded p-1 text-muted-foreground hover:bg-accent"
            title="Cancel"
          >
            <X className="size-3.5" />
          </button>
        </div>
      </TableCell>
    </TableRow>
  );
}

export function HostingClientList() {
  const { data, isLoading, isError } = useHostingClients({ limit: 100 });
  const hosting = data?.data ?? [];
  const remove = useDeleteHostingClient();
  const router = useRouter();

  const [editing, setEditing] = useState<HostingClient | null>(null);

  const handleDelete = (client: HostingClient) => {
    if (!window.confirm(`Delete hosting client ${client.domain}?`)) return;
    remove.mutate(client.id, {
      onSuccess: () => toast.success("Hosting client deleted"),
      onError: (err) =>
        toast.error(err instanceof Error ? err.message : "Delete failed"),
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Hosting Clients</h1>
          <p className="text-muted-foreground">
            {hosting.length} tracked domains
          </p>
        </div>
        <NewHostingDialog />
      </div>

      {isLoading && (
        <div className="space-y-3">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      )}

      {isError && (
        <div className="rounded-md bg-destructive/10 p-4 text-sm text-destructive">
          Failed to load hosting clients.
        </div>
      )}

      {!isLoading && !isError && (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Domain</TableHead>
                <TableHead>Client</TableHead>
                <TableHead>Result</TableHead>
                <TableHead>Assignee</TableHead>
                <TableHead>Comments</TableHead>
                <TableHead>Due Date</TableHead>
                <TableHead className="w-[140px] text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!isError && <QuickAddHostingRow />}
              {hosting.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="h-24 text-center text-muted-foreground"
                  >
                    No hosting clients yet.
                  </TableCell>
                </TableRow>
              )}
              {hosting.map((client) => (
                <TableRow
                  key={client.id}
                  className="group cursor-pointer"
                  onClick={() => router.push(`/hosting/${client.id}`)}
                >
                  <TableCell className="font-medium hover:underline">
                    {client.domain}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {client.clientName ?? "—"}
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <HostingResultInline
                      clientId={client.id}
                      value={client.result ?? null}
                    />
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <HostingAssigneeSelect
                      clientId={client.id}
                      value={client.assigneeId ?? null}
                    />
                  </TableCell>
                  <TableCell
                    className="max-w-[240px]"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <HostingCommentsInline
                      clientId={client.id}
                      value={client.comments}
                    />
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <HostingDueDateInline
                      clientId={client.id}
                      value={client.dueDate}
                    />
                  </TableCell>
                  <TableCell
                    className="whitespace-nowrap text-right"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        title="View"
                        onClick={() => router.push(`/hosting/${client.id}`)}
                      >
                        <Eye className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Edit"
                        onClick={() => setEditing(client)}
                      >
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Delete"
                        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => handleDelete(client)}
                      >
                        {remove.isPending && remove.variables === client.id ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <Trash2 className="size-4" />
                        )}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {editing && (
        <EditHostingDialog
          client={editing}
          open={!!editing}
          onOpenChange={(o) => !o && setEditing(null)}
        />
      )}
    </div>
  );
}
