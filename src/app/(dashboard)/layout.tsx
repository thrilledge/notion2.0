import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { syncUser } from "@/lib/sync-user";
import { getAuthz } from "@/lib/authz";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { NotificationBell } from "@/components/layout/notification-bell";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { TooltipProvider } from "@/components/ui/tooltip";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Ensure the auth user exists in our `users` table so FK references work.
  await syncUser(user);

  const authz = await getAuthz();
  const canManageTeam =
    !!authz &&
    (authz.isGlobalOwner ||
      Array.from(authz.memberships.values()).some((r) => r === "owner"));

  return (
    <TooltipProvider delayDuration={0}>
      <SidebarProvider>
        <AppSidebar user={user} canManageTeam={canManageTeam} />
        <div className="flex min-h-screen flex-1 flex-col">
          <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
            <SidebarTrigger />
            <Separator orientation="vertical" className="mr-2 h-4" />
            <div className="flex-1" />
            <NotificationBell />
          </header>
          <main className="flex-1 px-4 py-6 md:px-6">{children}</main>
        </div>
      </SidebarProvider>
    </TooltipProvider>
  );
}
