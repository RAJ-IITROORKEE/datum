import { NextRequest, NextResponse } from "next/server";
import { markUserLoggedOut } from "@/lib/sync-user";

/**
 * POST /api/logout-user
 * Marks the user as logged out in the database
 * Called when user logs out or session expires
 */
export async function POST(req: NextRequest) {
  try {
    const { clerkId } = await req.json();

    if (!clerkId) {
      return NextResponse.json(
        { error: "Clerk ID is required" },
        { status: 400 }
      );
    }

    const user = await markUserLoggedOut(clerkId);

    if (!user) {
      return NextResponse.json(
        { error: "Failed to update user status" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "User logged out successfully",
      data: user,
    });
  } catch (error) {
    console.error("Logout user error:", error);
    return NextResponse.json(
      { error: "Failed to update user status" },
      { status: 500 }
    );
  }
}
