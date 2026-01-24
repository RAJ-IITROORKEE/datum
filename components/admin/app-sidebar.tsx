"use client"

import * as React from "react"
import {
  LayoutDashboard,
  Users,
  Settings,
  GalleryVerticalEnd,
  Mail,
  Building2,
} from "lucide-react"
import { useUser } from "@clerk/nextjs"

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
      logo: '/datum_logo.png',
      plan: "AI Automation",
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
          title: "Users",
          url: config.routes.admin.dashboard,
        },
      ],
    },
    {
      title: "Contacts",
      url: config.routes.admin.contacts,
      icon: Users,
    },
    {
      title: "Newsletter",
      url: "/admin/newsletter",
      icon: Mail,
    },
    {
      title: "Admin Survey",
      url: "/admin/survey",
      icon: Building2,
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
  const { user } = useUser()
  
  const userData = {
    name: user?.fullName || user?.firstName || "Admin User",
    email: user?.primaryEmailAddress?.emailAddress || "admin@datum.com",
    avatar: user?.imageUrl || "",
  }
  
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
        <NavUser user={userData} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
