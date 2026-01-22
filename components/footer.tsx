"use client";

import { config } from "@/lib/config";

export default function Footer() {
  const currentYear = new Date().getFullYear();
  
  return (
    <footer className="border-t mt-8 bg-white/80 dark:bg-gray-900/80" suppressHydrationWarning>
      <div className="container mx-auto px-4 py-6 text-center text-sm text-gray-600 dark:text-gray-300">
        © {currentYear} {config.app.name}. All rights reserved.
      </div>
    </footer>
  );
}
