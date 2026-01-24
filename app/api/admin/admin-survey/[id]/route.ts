import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";

// GET: Fetch a single admin survey by ID
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    const survey = await prisma.adminSurvey.findUnique({
      where: { id },
    });

    if (!survey) {
      return NextResponse.json({ error: "Survey not found" }, { status: 404 });
    }

    return NextResponse.json(survey);
  } catch (error) {
    console.error("Error fetching admin survey:", error);
    return NextResponse.json(
      { error: "Failed to fetch admin survey" },
      { status: 500 }
    );
  }
}

// PUT: Update an admin survey
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = await req.json();

    const {
      firmsName,
      founderPrincipal,
      yearOfEstablishment,
      websiteLink,
      officeAddress,
      contactNumber,
      state,
      city,
      email,
    } = body;

    // Validate required fields
    if (
      !firmsName ||
      !founderPrincipal ||
      !officeAddress ||
      !contactNumber ||
      !state ||
      !city ||
      !email
    ) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: "Invalid email format" },
        { status: 400 }
      );
    }

    const survey = await prisma.adminSurvey.update({
      where: { id },
      data: {
        firmsName,
        founderPrincipal,
        yearOfEstablishment: yearOfEstablishment
          ? Number.parseInt(yearOfEstablishment)
          : null,
        websiteLink,
        officeAddress,
        contactNumber,
        state,
        city,
        email,
      },
    });

    return NextResponse.json(survey);
  } catch (error) {
    console.error("Error updating admin survey:", error);
    return NextResponse.json(
      { error: "Failed to update admin survey" },
      { status: 500 }
    );
  }
}

// DELETE: Delete an admin survey
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    await prisma.adminSurvey.delete({
      where: { id },
    });

    return NextResponse.json({ message: "Survey deleted successfully" });
  } catch (error) {
    console.error("Error deleting admin survey:", error);
    return NextResponse.json(
      { error: "Failed to delete admin survey" },
      { status: 500 }
    );
  }
}
