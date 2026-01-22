"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";

export default function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return (
      <button
        aria-label="Toggle theme"
        className="px-3 py-1 rounded-md border hover:bg-gray-100 dark:hover:bg-gray-800"
        disabled
      >
        <span className="opacity-0">Theme</span>
      </button>
    );
  }

  const isDark = theme === "dark";

  return (
    <button
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label="Toggle theme"
      className="px-3 py-1 rounded-md border hover:bg-gray-100 dark:hover:bg-gray-800"
    >
      {isDark ? "🌙 Dark" : "☀️ Light"}
    </button>
  );
}
