import { Badge } from "@/components/ui/badge";

const statusStyles: Record<string, string> = {
  not_started: "bg-muted text-muted-foreground",
  in_progress: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  done: "bg-green-500/15 text-green-600 dark:text-green-400",
  archived: "bg-muted text-muted-foreground",
};

const resultStyles: Record<string, string> = {
  company_work: "bg-red-500/15 text-red-600 dark:text-red-400",
  not_started: "bg-muted text-muted-foreground",
  stuck: "bg-pink-500/15 text-pink-600 dark:text-pink-400",
  pending_review: "bg-gray-500/15 text-gray-600 dark:text-gray-300",
  in_progress: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  upcoming_renewal: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400",
  done: "bg-green-500/15 text-green-600 dark:text-green-400",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <Badge
      variant="secondary"
      className={`capitalize border-transparent ${statusStyles[status] ?? ""}`}
    >
      {status.replace(/_/g, " ")}
    </Badge>
  );
}

export function ResultBadge({ result }: { result: string | null }) {
  if (!result) return <span className="text-muted-foreground">—</span>;
  return (
    <Badge
      variant="secondary"
      className={`capitalize border-transparent ${resultStyles[result] ?? ""}`}
    >
      {result.replace(/_/g, " ")}
    </Badge>
  );
}
