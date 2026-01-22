import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { syncUser } from "@/lib/sync-user";

/**
 * POST /api/sync-user
 * Syncs the authenticated user from Clerk to the database
 * Called automatically when user logs in or signs up
 */
export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json(
        { error: "Unauthorized. Please sign in." },
        { status: 401 }
      );
    }

    const user = await syncUser();

    if (!user) {
      return NextResponse.json(
        { error: "Failed to sync user" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "User synced successfully",
      data: user,
    });
  } catch (error) {
    console.error("Sync user error:", error);
    return NextResponse.json(
      { error: "Failed to sync user" },
      { status: 500 }
    );
  }
}
