"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, FolderKanban, Globe, Users, FileText, CalendarDays, BookOpen, Rocket, Settings, Folder } from "lucide-react";
import type { User } from "@supabase/supabase-js";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LogOut, ChevronsUpDown } from "lucide-react";

export type SidebarFolder = {
  id: string;
  name: string;
  kind: "project" | "hosting_client";
  code: string | null;
};

function initials(name: string | undefined) {
  if (!name) return "?";
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function AppSidebar({
  user,
  canManageTeam,
  folders,
}: {
  user: User;
  canManageTeam: boolean;
  folders: SidebarFolder[];
}) {
  const pathname = usePathname();
  const { isMobile, setOpenMobile } = useSidebar();

  const navigate = () => {
    if (isMobile) setOpenMobile(false);
  };

  const canSeeAllProjects = folders.some((f) => f.code === "all_projects");
  const canSeeSideProjects = folders.some((f) => f.code === "side_projects");
  const customProjectFolders = folders.filter(
    (f) => !f.code && f.kind === "project"
  );
  const customHostingFolders = folders.filter(
    (f) => !f.code && f.kind === "hosting_client"
  );
  // A member may only hold custom hosting-folder grants (no system hosting
  // folder); the Hosting section must still appear so those folders are
  // reachable.
  const canSeeHosting =
    folders.some((f) => f.code === "hosting_clients") ||
    customHostingFolders.length > 0;

  const projectsChildren = [
    ...(canSeeAllProjects ? [{ title: "All Projects", href: "/projects" }] : []),
    ...(canSeeSideProjects ? [{ title: "Side Projects", href: "/side-projects" }] : []),
    ...customProjectFolders.map((f) => ({
      title: f.name,
      href: `/folders/${f.id}`,
    })),
    { title: "Trash", href: "/trash" },
  ];

  const hostingChildren = customHostingFolders.map((f) => ({
    title: f.name,
    href: `/folders/${f.id}`,
  }));

  const staticNav = [
    { title: "Dashboard", href: "/", icon: LayoutDashboard },
    ...(projectsChildren.length > 1
      ? [
          {
            title: "Projects",
            href: "/projects",
            icon: FolderKanban,
            children: projectsChildren,
          },
        ]
      : []),
    ...(canSeeHosting
      ? [
          hostingChildren.length > 0
            ? {
                title: "Hosting Clients",
                href: "/hosting",
                icon: Globe,
                children: [
                  { title: "All Hosting Clients", href: "/hosting" },
                  ...hostingChildren,
                ],
              }
            : { title: "Hosting Clients", href: "/hosting", icon: Globe },
        ]
      : []),
    { title: "Docs", href: "/docs", icon: FileText },
    { title: "Meetings", href: "/meetings", icon: CalendarDays },
    { title: "Wiki", href: "/wiki", icon: BookOpen },
  ];

  const nav = canManageTeam
    ? [
        ...staticNav,
        { title: "Team", href: "/team", icon: Users },
        { title: "Settings", href: "/settings", icon: Settings },
      ]
    : [
        ...staticNav,
        { title: "Settings", href: "/settings", icon: Settings },
      ];

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link href="/" onClick={navigate}>
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                  <Rocket className="size-4" />
                </div>
                <div className="flex flex-col gap-0.5 leading-none">
                  <span className="font-semibold">PM Workspace</span>
                  <span className="text-xs text-muted-foreground">
                    Project Manager
                  </span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Workspace</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {nav.map((item) => (
                <SidebarMenuItem key={item.href}>
                  {item.children ? (
                    <SidebarMenuButton asChild isActive={pathname.startsWith(item.href)} tooltip={item.title}>
                      <Link href={item.href} onClick={navigate}>
                        <item.icon />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  ) : (
                    <SidebarMenuButton asChild isActive={pathname === item.href} tooltip={item.title}>
                      <Link href={item.href} onClick={navigate}>
                        <item.icon />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  )}
                  {item.children && (
                    <SidebarMenuSub>
                      {item.children.map((child) => (
                        <SidebarMenuSubItem key={child.href}>
                          <SidebarMenuSubButton
                            asChild
                            isActive={pathname === child.href}
                          >
                            <Link href={child.href} onClick={navigate}>
                              <span>{child.title}</span>
                            </Link>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      ))}
                    </SidebarMenuSub>
                  )}
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton
                  size="lg"
                  className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                >
                  <Avatar className="size-8 rounded-lg">
                    <AvatarImage
                      src={user.user_metadata.avatar_url}
                      alt={user.user_metadata.full_name ?? "User"}
                    />
                    <AvatarFallback className="rounded-lg">
                      {initials(user.user_metadata.full_name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-semibold">
                      {user.user_metadata.full_name}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      {user.email}
                    </span>
                  </div>
                  <ChevronsUpDown className="ml-auto size-4" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                side="right"
                align="start"
                sideOffset={4}
                className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
              >
                <DropdownMenuLabel className="p-0 font-normal">
                  <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                    <Avatar className="size-8 rounded-lg">
                      <AvatarImage src={user.user_metadata.avatar_url} alt="" />
                      <AvatarFallback className="rounded-lg">
                        {initials(user.user_metadata.full_name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="grid flex-1 text-left text-sm leading-tight">
                      <span className="truncate font-semibold">
                        {user.user_metadata.full_name}
                      </span>
                      <span className="truncate text-xs">{user.email}</span>
                    </div>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <form action="/api/auth/logout" method="POST">
                    <button type="submit" className="flex w-full items-center gap-2">
                      <LogOut className="size-4" />
                      Sign out
                    </button>
                  </form>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
