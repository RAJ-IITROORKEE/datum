"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@clerk/nextjs";

/**
 * UserSync Component
 * Automatically syncs the authenticated user to the database
 * Should be placed in the root layout or authenticated layout
 */
export default function UserSync() {
  const { userId, isLoaded } = useAuth();
  const previousUserIdRef = useRef<string | null>(null);
  const [isMounted, setIsMounted] = useState(false);

  // Avoid hydration errors by only running on client
  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (!isMounted) return;

    const syncUserToDatabase = async () => {
      if (isLoaded && userId) {
        try {
          const response = await fetch("/api/sync-user", {
            method: "POST",
          });

          if (response.ok) {
            const data = await response.json();
            console.log("✅ User synced to database:", data.data?.email);
          }
        } catch (error) {
          console.error("Failed to sync user:", error);
        }
      }
    };

    const markUserAsLoggedOut = async (clerkId: string) => {
      try {
        const response = await fetch("/api/logout-user", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ clerkId }),
        });

        if (response.ok) {
          console.log("✅ User marked as logged out");
        }
      } catch (error) {
        console.error("Failed to mark user as logged out:", error);
      }
    };

    // User logged in or switched accounts
    if (isLoaded && userId && userId !== previousUserIdRef.current) {
      syncUserToDatabase();
      previousUserIdRef.current = userId;
    }

    // User logged out or session expired
    if (isLoaded && !userId && previousUserIdRef.current) {
      markUserAsLoggedOut(previousUserIdRef.current);
      previousUserIdRef.current = null;
    }
  }, [userId, isLoaded, isMounted]);

  // Handle page unload/close (user closes tab/browser)
  useEffect(() => {
    if (!isMounted || typeof window === "undefined") return;

    const handleBeforeUnload = () => {
      if (userId) {
        // Use sendBeacon for reliable logout on page close
        const blob = new Blob(
          [JSON.stringify({ clerkId: userId })],
          { type: "application/json" }
        );
        navigator.sendBeacon("/api/logout-user", blob);
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [userId, isMounted]);

  return null; // This component doesn't render anything
}
