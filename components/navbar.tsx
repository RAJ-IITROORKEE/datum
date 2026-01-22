"use client";

import { useState } from "react";
import Link from "next/link";
import { SignInButton, SignUpButton, SignedIn, SignedOut, UserButton } from "@clerk/nextjs";
import ThemeToggle from "./ui/theme-toggle";
import { config } from "@/lib/config";
import { Button } from "./ui/button";
import { HoveredLink, Menu, MenuItem } from "@/components/ui/navbar-menu";
import { cn } from "@/lib/utils";

const features = [
  {
    title: "Datum AI Drafter",
    href: "/features/ai-drafter",
    description: "AI-assisted CAD design automation for architectural drawings and blueprints.",
  },
  {
    title: "3D Planner",
    href: "/features/3d-planner",
    description: "Natural language-processed 3D modeling and space planning tools.",
  },
];

const documentation = [
  {
    title: "Getting Started",
    href: "/docs/getting-started",
    description: "Learn how to integrate our AI-powered design tools into your workflow.",
  },
  {
    title: "API Reference",
    href: "/docs/api",
    description: "Complete API documentation for developers and integrators.",
  },
  {
    title: "Tutorials",
    href: "/docs/tutorials",
    description: "Step-by-step guides for common design automation tasks.",
  },
];

export default function Navbar() {
  const [active, setActive] = useState<string | null>(null);

  return (
    <header className="relative w-full flex items-center justify-center py-4" suppressHydrationWarning>
      <div className="fixed top-4 inset-x-0 max-w-7xl mx-auto z-50 flex items-center justify-between px-6">
        <div className="flex-shrink-0 w-48">
          <Link href={config.routes.home} className="font-bold text-xl text-black dark:text-white">
            {config.app.name}
          </Link>
        </div>

        <div className="flex-1 flex justify-center hidden md:flex">
          <Menu setActive={setActive}>
            <Link href="/about" className="cursor-pointer text-black dark:text-white hover:text-blue-600 dark:hover:text-blue-400 hover:drop-shadow-[0_0_8px_rgba(59,130,246,0.5)] transition-all duration-300">
              About
            </Link>

            <MenuItem setActive={setActive} active={active} item="Features">
              <div className="flex flex-col space-y-4 text-sm">
                {features.map((feature) => (
                  <HoveredLink key={feature.title} href={feature.href}>
                    <div>
                      <div className="font-medium text-black dark:text-white">{feature.title}</div>
                      <p className="text-xs text-neutral-700 dark:text-neutral-300 mt-1">
                        {feature.description}
                      </p>
                    </div>
                  </HoveredLink>
                ))}
              </div>
            </MenuItem>

            <MenuItem setActive={setActive} active={active} item="Documentation">
              <div className="flex flex-col space-y-4 text-sm">
                {documentation.map((doc) => (
                  <HoveredLink key={doc.title} href={doc.href}>
                    <div>
                      <div className="font-medium text-black dark:text-white">{doc.title}</div>
                      <p className="text-xs text-neutral-700 dark:text-neutral-300 mt-1">
                        {doc.description}
                      </p>
                    </div>
                  </HoveredLink>
                ))}
              </div>
            </MenuItem>

            <Link href="/contacts" className="cursor-pointer text-black dark:text-white hover:text-blue-600 dark:hover:text-blue-400 hover:drop-shadow-[0_0_8px_rgba(59,130,246,0.5)] transition-all duration-300">
              Contact
            </Link>
          </Menu>
        </div>

        <div className="flex-shrink-0 w-48 flex items-center justify-end gap-3">
          <ThemeToggle />
          
          <SignedOut>
            <SignInButton mode="modal">
              <Button variant="ghost" size="sm">
                Sign In
              </Button>
            </SignInButton>
            <SignUpButton mode="modal">
              <Button size="sm">
                Sign Up
              </Button>
            </SignUpButton>
          </SignedOut>
          
          <SignedIn>
            <UserButton />
          </SignedIn>
        </div>
      </div>
    </header>
  );
}
