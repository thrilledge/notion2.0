"use client";

import { format } from "date-fns";
import { useHostingClients } from "@/hooks/use-hosting";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge, ResultBadge } from "@/components/shared/status-badges";
import { NewHostingDialog } from "@/components/projects/new-hosting-dialog";

export function HostingClientList() {
  const { data, isLoading, isError } = useHostingClients({ limit: 100 });
  const hosting = data?.data ?? [];

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
                <TableHead>Status</TableHead>
                <TableHead>Result</TableHead>
                <TableHead>Due Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {hosting.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="h-24 text-center text-muted-foreground"
                  >
                    No hosting clients yet.
                  </TableCell>
                </TableRow>
              )}
              {hosting.map((client) => (
                <TableRow key={client.id}>
                  <TableCell className="font-medium">{client.domain}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {client.clientName ?? "—"}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={client.status} />
                  </TableCell>
                  <TableCell>
                    <ResultBadge result={client.result} />
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {client.dueDate
                      ? format(new Date(client.dueDate), "MMM d, yyyy")
                      : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
