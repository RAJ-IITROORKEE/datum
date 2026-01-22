import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

// Validation schema
const newsletterSchema = z.object({
  email: z.string().email("Invalid email address"),
});

export async function GET() {
  try {
    const newsletters = await prisma.newsletter.findMany({
      orderBy: {
        createdAt: "desc",
      },
    });

    return NextResponse.json({
      success: true,
      data: newsletters,
      count: newsletters.length,
    });
  } catch (error) {
    console.error("Fetch newsletters error:", error);
    return NextResponse.json(
      { error: "Failed to fetch newsletters" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    // Parse request body
    const body = await req.json();

    // Validate input
    const validatedData = newsletterSchema.parse(body);

    // Check if email already exists
    const existingSubscription = await prisma.newsletter.findUnique({
      where: { email: validatedData.email },
    });

    if (existingSubscription) {
      return NextResponse.json(
        { error: "This email is already subscribed to our newsletter" },
        { status: 409 }
      );
    }

    // Create newsletter subscription
    const newsletter = await prisma.newsletter.create({
      data: {
        email: validatedData.email,
      },
    });

    return NextResponse.json(
      {
        success: true,
        message: "Successfully subscribed to newsletter!",
        data: newsletter,
      },
      { status: 201 }
    );
  } catch (error) {
    // Handle validation errors
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.errors[0].message },
        { status: 400 }
      );
    }

    // Handle database errors
    console.error("Newsletter subscription error:", error);
    return NextResponse.json(
      { error: "Failed to subscribe. Please try again later." },
      { status: 500 }
    );
  }
}
