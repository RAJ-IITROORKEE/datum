"use client";

import { useState } from "react";
import Link from "next/link";
import {
  SignInButton,
  SignUpButton,
  SignedIn,
  SignedOut,
  UserButton,
} from "@clerk/nextjs";
import ThemeToggle from "./ui/theme-toggle";
import { config } from "@/lib/config";
import { Button } from "./ui/button";
import { HoveredLink, Menu, MenuItem } from "@/components/ui/navbar-menu";
import { cn } from "@/lib/utils";
import { Menu as MenuIcon, ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

const features = [
  {
    title: "Datum AI Drafter",
    href: "/features/ai-drafter",
    description:
      "AI-assisted CAD design automation for architectural drawings and blueprints.",
  },
  {
    title: "3D Planner",
    href: "/features/3d-planner",
    description:
      "Natural language-processed 3D modeling and space planning tools.",
  },
];

const documentation = [
  {
    title: "Getting Started",
    href: "/docs/getting-started",
    description:
      "Learn how to integrate our AI-powered design tools into your workflow.",
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
  const [featuresOpen, setFeaturesOpen] = useState(false);
  const [docsOpen, setDocsOpen] = useState(false);

  return (
    <header
      className="relative w-full flex items-center justify-center py-4"
      suppressHydrationWarning
    >
      <div className="fixed top-5 inset-x-0 max-w-8xl mx-auto z-50 px-6">
        <div className="relative flex items-center">
          {/* Logo */}
          <div className="shrink-0 inline-flex items-center">
            <Link href={config.routes.home} className="flex items-center">
              <img
                src="/datum_logo.png"
                alt={config.app.name}
                className="h-10 w-auto rounded-full"
              />
            </Link>
            {/* // Brand name  */}
            <span className="ml-4 text-2xl font-bold ">{config.app.name}</span>
          </div>

          {/* Desktop Menu - Absolutely Centered */}
          <div className="absolute left-1/2 mt-4 transform -translate-x-1/2 hidden md:flex">
            <Menu setActive={setActive}>
            <Link
              href="/about"
              className="cursor-pointer text-black dark:text-white hover:text-blue-600 dark:hover:text-blue-400 hover:drop-shadow-[0_0_8px_rgba(59,130,246,0.5)] transition-all duration-300"
            >
              About
            </Link>

            <MenuItem setActive={setActive} active={active} item="Features">
              <div className="flex flex-col space-y-4 text-sm">
                {features.map((feature) => (
                  <HoveredLink key={feature.title} href={feature.href}>
                    <div>
                      <div className="font-medium text-black dark:text-white">
                        {feature.title}
                      </div>
                      <p className="text-xs text-neutral-700 dark:text-neutral-300 mt-1">
                        {feature.description}
                      </p>
                    </div>
                  </HoveredLink>
                ))}
              </div>
            </MenuItem>

            <MenuItem
              setActive={setActive}
              active={active}
              item="Documentation"
            >
              <div className="flex flex-col space-y-4 text-sm">
                {documentation.map((doc) => (
                  <HoveredLink key={doc.title} href={doc.href}>
                    <div>
                      <div className="font-medium text-black dark:text-white">
                        {doc.title}
                      </div>
                      <p className="text-xs text-neutral-700 dark:text-neutral-300 mt-1">
                        {doc.description}
                      </p>
                    </div>
                  </HoveredLink>
                ))}
              </div>
            </MenuItem>

            <Link
              href="/contacts"
              className="cursor-pointer text-black dark:text-white hover:text-blue-600 dark:hover:text-blue-400 hover:drop-shadow-[0_0_8px_rgba(59,130,246,0.5)] transition-all duration-300"
            >
              Contact
            </Link>
          </Menu>
        </div>

        {/* Desktop Auth Buttons */}
        <div className="ml-auto hidden md:flex shrink-0 items-center justify-end gap-3">
          <ThemeToggle />

          <SignedOut>
            <SignInButton mode="modal">
              <Button size="sm">Sign In</Button>
            </SignInButton>
          </SignedOut>

          <SignedIn>
            <UserButton />
          </SignedIn>
        </div>
      </div>

      {/* Mobile Menu */}
      <div className="ml-auto flex md:hidden items-center gap-2 absolute right-6 top-4 z-50">
          <ThemeToggle />
          <SignedIn>
            <UserButton />
          </SignedIn>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden">
                <MenuIcon className="h-6 w-6" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="w-70 max-h-[calc(100vh-100px)] overflow-y-auto"
            >
              <DropdownMenuItem asChild>
                <Link href="/about" className="cursor-pointer w-full">
                  About
                </Link>
              </DropdownMenuItem>

              <DropdownMenuSub>
                <DropdownMenuSubTrigger>Features</DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="w-62.5">
                  {features.map((feature) => (
                    <DropdownMenuItem key={feature.title} asChild>
                      <Link
                        href={feature.href}
                        className="cursor-pointer flex flex-col items-start py-2"
                      >
                        <span className="font-medium">{feature.title}</span>
                        <span className="text-xs text-muted-foreground mt-1">
                          {feature.description}
                        </span>
                      </Link>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>

              <DropdownMenuSub>
                <DropdownMenuSubTrigger>Documentation</DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="w-62.5">
                  {documentation.map((doc) => (
                    <DropdownMenuItem key={doc.title} asChild>
                      <Link
                        href={doc.href}
                        className="cursor-pointer flex flex-col items-start py-2"
                      >
                        <span className="font-medium">{doc.title}</span>
                        <span className="text-xs text-muted-foreground mt-1">
                          {doc.description}
                        </span>
                      </Link>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>

              <DropdownMenuItem asChild>
                <Link href="/contacts" className="cursor-pointer w-full">
                  Contact
                </Link>
              </DropdownMenuItem>

              <SignedOut>
                <DropdownMenuSeparator />
                <DropdownMenuLabel>Account</DropdownMenuLabel>
                <DropdownMenuItem asChild>
                  <SignInButton mode="modal">
                    <button className="w-full text-left">Sign In</button>
                  </SignInButton>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <SignUpButton mode="modal">
                    <button className="w-full text-left">Sign Up</button>
                  </SignUpButton>
                </DropdownMenuItem>
              </SignedOut>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
