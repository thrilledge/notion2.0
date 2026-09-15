import { redirect } from "next/navigation";
import { eq, inArray } from "drizzle-orm";
import { FolderKanban, Globe, CircleCheck, Clock } from "lucide-react";
import { db } from "@/lib/db";
import { projects, hostingClients } from "@/lib/db/schema";
import {
  getAuthz,
  getAccessibleProjectIds,
  getAccessibleHostingClientIds,
} from "@/lib/authz";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function DashboardPage() {
  const authz = await getAuthz();
  if (!authz) redirect("/login");

  const ids = await getAccessibleProjectIds(authz);
  const scoped = ids.length > 0 ? inArray(projects.id, ids) : undefined;
  const hostingIds = await getAccessibleHostingClientIds(authz);
  const hostingScoped =
    hostingIds.length > 0 ? inArray(hostingClients.id, hostingIds) : undefined;

  const [totalProjects, activeProjects, totalHosting, doneProjects] =
    scoped
      ? await Promise.all([
          db.$count(projects, scoped),
          db.$count(projects, scoped && eq(projects.status, "in_progress")),
          hostingScoped
            ? db.$count(hostingClients, hostingScoped)
            : Promise.resolve(0),
          db.$count(projects, scoped && eq(projects.status, "done")),
        ])
      : [0, 0, 0, 0];

  const stats = [
    {
      title: "Total Projects",
      value: totalProjects,
      icon: FolderKanban,
      description: `${activeProjects} in progress`,
    },
    {
      title: "Hosting Clients",
      value: totalHosting,
      icon: Globe,
      description: "Tracked domains",
    },
    {
      title: "Done",
      value: doneProjects,
      icon: CircleCheck,
      description: "Completed projects",
    },
    {
      title: "In Progress",
      value: activeProjects,
      icon: Clock,
      description: "Active work",
    },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">
          Here&apos;s what&apos;s happening across your workspace.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.title}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                {stat.title}
              </CardTitle>
              <stat.icon className="size-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.value}</div>
              <p className="text-xs text-muted-foreground">
                {stat.description}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
