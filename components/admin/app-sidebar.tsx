"use client"

import * as React from "react"
import {
  LayoutDashboard,
  Users,
  Settings,
  GalleryVerticalEnd,
} from "lucide-react"

import { NavMain } from "@/components/admin/nav-main"
import { NavProjects } from "@/components/admin/nav-projects"
import { NavUser } from "@/components/admin/nav-user"
import { TeamSwitcher } from "@/components/admin/team-switcher"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
} from "@/components/admin/ui/sidebar"
import { config } from "@/lib/config"

// Admin navigation data
const data = {
  user: {
    name: "Admin User",
    email: "admin@datum.com",
    avatar: "",
  },
  teams: [
    {
      name: `${config.app.name} Admin`,
      logo: GalleryVerticalEnd,
      plan: "Enterprise",
    },
  ],
  navMain: [
    {
      title: "Dashboard",
      url: config.routes.admin.dashboard,
      icon: LayoutDashboard,
      isActive: true,
      items: [
        {
          title: "Overview",
          url: config.routes.admin.dashboard,
        },
      ],
    },
    {
      title: "Contacts",
      url: config.routes.admin.contacts,
      icon: Users,
      items: [
        {
          title: "All Contacts",
          url: config.routes.admin.contacts,
        },
      ],
    },
    {
      title: "Settings",
      url: config.routes.admin.settings,
      icon: Settings,
      items: [
        {
          title: "General",
          url: config.routes.admin.settings,
        },
      ],
    },
  ],
  projects: [],
}

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <TeamSwitcher teams={data.teams} />
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={data.navMain} />
        {data.projects.length > 0 && <NavProjects projects={data.projects} />}
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={data.user} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
