import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

// Validation schema for user registration
const registerSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Invalid email address"),
  phone: z.string().optional(),
  profession: z.string().optional(),
});

/**
 * POST /api/register
 * Register a new user when they first sign up via Clerk
 * This creates a user record in our database linked to their Clerk account
 */
export async function POST(req: NextRequest) {
  try {
    // Step 1: Get the authenticated user from Clerk
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json(
        { error: "Unauthorized. Please sign in." },
        { status: 401 }
      );
    }

    // Step 2: Parse and validate request body
    const body = await req.json();
    const validatedData = registerSchema.parse(body);

    // Step 3: Check if user already exists with this clerkId
    const existingUser = await prisma.user.findUnique({
      where: { clerkId: userId },
    });

    if (existingUser) {
      return NextResponse.json(
        { error: "User already registered", data: existingUser },
        { status: 409 }
      );
    }

    // Step 4: Check if email is already taken by another user
    const emailExists = await prisma.user.findUnique({
      where: { email: validatedData.email },
    });

    if (emailExists) {
      return NextResponse.json(
        { error: "Email already in use" },
        { status: 409 }
      );
    }

    // Step 5: Create new user in database
    const user = await prisma.user.create({
      data: {
        clerkId: userId,
        name: validatedData.name,
        email: validatedData.email,
        phone: validatedData.phone || null,
        profession: validatedData.profession || null,
        isLoggedIn: true,
      },
    });

    // Step 6: Return success response
    return NextResponse.json(
      {
        success: true,
        message: "User registered successfully!",
        data: user,
      },
      { status: 201 }
    );
  } catch (error) {
    // Handle validation errors
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues[0].message },
        { status: 400 }
      );
    }

    // Handle database errors
    console.error("User registration error:", error);
    return NextResponse.json(
      { error: "Failed to register user. Please try again later." },
      { status: 500 }
    );
  }
}

/**
 * GET /api/register
 * Get current user's profile data
 */
export async function GET() {
  try {
    // Step 1: Get authenticated user
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json(
        { error: "Unauthorized. Please sign in." },
        { status: 401 }
      );
    }

    // Step 2: Find user in database
    const user = await prisma.user.findUnique({
      where: { clerkId: userId },
    });

    if (!user) {
      return NextResponse.json(
        { error: "User not found. Please complete registration." },
        { status: 404 }
      );
    }

    // Step 3: Return user data
    return NextResponse.json({
      success: true,
      data: user,
    });
  } catch (error) {
    console.error("Fetch user error:", error);
    return NextResponse.json(
      { error: "Failed to fetch user data" },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/register
 * Update user profile details
 */
export async function PUT(req: NextRequest) {
  try {
    // Step 1: Authenticate user
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json(
        { error: "Unauthorized. Please sign in." },
        { status: 401 }
      );
    }

    // Step 2: Verify user exists
    const existingUser = await prisma.user.findUnique({
      where: { clerkId: userId },
    });

    if (!existingUser) {
      return NextResponse.json(
        { error: "User not found. Please register first." },
        { status: 404 }
      );
    }

    // Step 3: Parse and validate update data
    const body = await req.json();
    
    // Partial schema for updates (all fields optional)
    const updateSchema = z.object({
      name: z.string().min(2, "Name must be at least 2 characters").optional(),
      phone: z.string().optional(),
      profession: z.string().optional(),
    });

    const validatedData = updateSchema.parse(body);

    // Step 4: Check if any data was provided
    if (Object.keys(validatedData).length === 0) {
      return NextResponse.json(
        { error: "No update data provided" },
        { status: 400 }
      );
    }

    // Step 5: Update user in database
    const updatedUser = await prisma.user.update({
      where: { clerkId: userId },
      data: validatedData,
    });

    // Step 6: Return updated user data
    return NextResponse.json({
      success: true,
      message: "Profile updated successfully!",
      data: updatedUser,
    });
  } catch (error) {
    // Handle validation errors
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues[0].message },
        { status: 400 }
      );
    }

    // Handle database errors
    console.error("User update error:", error);
    return NextResponse.json(
      { error: "Failed to update profile. Please try again later." },
      { status: 500 }
    );
  }
}
