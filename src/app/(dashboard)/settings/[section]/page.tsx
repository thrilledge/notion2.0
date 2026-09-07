import { notFound } from "next/navigation";
import { getAuthz } from "@/lib/authz";
import { SettingsShell } from "@/components/settings/settings-shell";
import { ProfilePanel } from "@/components/settings/panels/profile-panel";
import { GeneralPanel } from "@/components/settings/panels/general-panel";
import { AppearancePanel } from "@/components/settings/panels/appearance-panel";
import { MembersPanel } from "@/components/settings/panels/members-panel";
import { AccessPanel } from "@/components/settings/panels/access-panel";
import { WorkspacesPanel } from "@/components/settings/panels/workspaces-panel";
import { ProjectsPanel } from "@/components/settings/panels/projects-panel";
import { NotificationsPanel } from "@/components/settings/panels/notifications-panel";
import { SecurityPanel } from "@/components/settings/panels/security-panel";

const sections: Record<string, { title: string; description: string }> = {
  profile: {
    title: "My Profile",
    description: "Your name, avatar, and the roles you hold across workspaces.",
  },
  general: {
    title: "General",
    description: "Workspace overview and basic information.",
  },
  appearance: {
    title: "Appearance",
    description: "Customize how the app looks for you.",
  },
  members: {
    title: "Members",
    description: "Invite people and manage who belongs to your workspace.",
  },
  access: {
    title: "Access & Permissions",
    description: "Control roles and which projects each member can access.",
  },
  workspaces: {
    title: "Workspaces",
    description: "Create and organize your workspaces.",
  },
  projects: {
    title: "Projects",
    description: "Browse all projects across your workspaces.",
  },
  notifications: {
    title: "Notifications",
    description: "Choose what you get notified about.",
  },
  security: {
    title: "Security",
    description: "Authentication and account security.",
  },
};

/** Workspace-admin sections: hidden from plain members (Notion-style). */
const WORKSPACE_SECTIONS = new Set([
  "general",
  "members",
  "access",
  "workspaces",
  "projects",
]);

export default async function SettingsSection({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
  if (!sections[section]) notFound();

  const authz = await getAuthz();
  if (!authz) notFound();

  const isManager =
    authz.isGlobalOwner ||
    Array.from(authz.memberships.values()).some((r) => r === "owner");

  // Members get only their personal settings; workspace administration stays
  // with workspace owners and the global owner.
  if (WORKSPACE_SECTIONS.has(section) && !isManager) notFound();

  const { title, description } = sections[section];

  return (
    <SettingsShell isManager={isManager}>
      <div className="space-y-6">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
        <div className="h-px w-full bg-border" />

        <SectionPanel section={section} />
      </div>
    </SettingsShell>
  );
}

function SectionPanel({ section }: { section: string }) {
  switch (section) {
    case "profile":
      return <ProfilePanel />;
    case "general":
      return <GeneralPanel />;
    case "appearance":
      return <AppearancePanel />;
    case "members":
      return <MembersPanel />;
    case "access":
      return <AccessPanel />;
    case "workspaces":
      return <WorkspacesPanel />;
    case "projects":
      return <ProjectsPanel />;
    case "notifications":
      return <NotificationsPanel />;
    case "security":
      return <SecurityPanel />;
    default:
      return null;
  }
}