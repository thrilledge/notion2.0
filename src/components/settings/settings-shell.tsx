import { Separator } from "@/components/ui/separator";
import { SettingsSidebar } from "@/components/settings/settings-sidebar";

/**
 * Notion-style settings shell: left navigation sidebar + content area.
 * Rendered from each /settings/[section] page (not a route layout) to avoid
 * Next.js layout/route-group typing conflicts.
 */
export function SettingsShell({
  children,
  isManager,
}: {
  children: React.ReactNode;
  isManager?: boolean;
}) {
  return (
    <div className="mx-auto w-full max-w-6xl">
      <div className="flex flex-col gap-6 md:flex-row">
        <aside className="w-full shrink-0 md:w-56 lg:w-64">
          <div className="md:sticky md:top-6">
            <div className="mb-5">
              <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
            </div>
            <SettingsSidebar isManager={isManager} />
          </div>
        </aside>
        <Separator orientation="vertical" className="hidden md:block" />
        <main className="min-w-0 flex-1 pb-10 pr-1">{children}</main>
      </div>
    </div>
  );
}
