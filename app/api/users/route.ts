import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@clerk/nextjs/server";

/**
 * GET /api/users
 * Fetch all registered users with statistics
 * Protected endpoint - requires authentication
 */
export async function GET() {
  try {
    // Step 1: Authenticate the request
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json(
        { error: "Unauthorized. Please sign in." },
        { status: 401 }
      );
    }

    // Step 2: Fetch all users from database
    const users = await prisma.user.findMany({
      orderBy: {
        createdAt: "desc",
      },
    });

    // Step 3: Calculate statistics
    const totalUsers = users.length;
    const loggedInUsers = users.filter((user) => user.isLoggedIn).length;
    const loggedOutUsers = totalUsers - loggedInUsers;

    // Calculate users registered this month
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const usersThisMonth = users.filter(
      (user) => new Date(user.createdAt) >= startOfMonth
    ).length;

    // Step 4: Return data with statistics
    return NextResponse.json({
      success: true,
      data: users,
      stats: {
        total: totalUsers,
        loggedIn: loggedInUsers,
        loggedOut: loggedOutUsers,
        thisMonth: usersThisMonth,
      },
    });
  } catch (error) {
    console.error("Fetch users error:", error);
    return NextResponse.json(
      { error: "Failed to fetch users" },
      { status: 500 }
    );
  }
}
