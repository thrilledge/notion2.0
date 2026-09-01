import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export function ComingSoon({
  title,
  description,
  icon: Icon,
}: {
  title: string;
  description: string;
  icon: LucideIcon;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
        <p className="text-muted-foreground">{description}</p>
      </div>
      <Card>
        <CardContent className="flex flex-col items-center justify-center gap-4 py-16 text-center">
          <div className="flex size-16 items-center justify-center rounded-full bg-primary/10">
            <Icon className="size-8 text-primary" />
          </div>
          <div>
            <p className="font-medium">Coming soon</p>
            <p className="text-sm text-muted-foreground">
              This section will be fully integrated after data migration.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
