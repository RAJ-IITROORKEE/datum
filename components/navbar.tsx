"use client";

import Link from "next/link";
import ThemeToggle from "./ui/theme-toggle";
import { config } from "@/lib/config";

export default function Navbar() {
  return (
    <header className="border-b bg-white/80 dark:bg-gray-900/80 backdrop-blur" suppressHydrationWarning>
      <div className="container mx-auto px-4 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href={config.routes.home} className="font-bold text-lg">
            {config.app.name}
          </Link>
        </div>

        <nav className="hidden md:flex items-center gap-6">
          <Link href={config.routes.main.about} className="hover:underline">
            About
          </Link>
          <Link href={config.routes.main.contacts} className="hover:underline">
            Contacts
          </Link>
        </nav>

        <div className="flex items-center gap-3">
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
