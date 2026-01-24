import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";

// GET: Fetch all admin surveys with optional filtering and pagination
export async function GET(req: NextRequest) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const page = Number.parseInt(searchParams.get("page") || "1");
    const limit = Number.parseInt(searchParams.get("limit") || "10");
    const search = searchParams.get("search") || "";
    const state = searchParams.get("state") || "";
    const city = searchParams.get("city") || "";
    const sortBy = searchParams.get("sortBy") || "createdAt";
    const sortOrder = searchParams.get("sortOrder") || "desc";

    const skip = (page - 1) * limit;

    // Build where clause
    const where: Record<string, unknown> = {};

    if (search) {
      where.OR = [
        { firmsName: { contains: search, mode: "insensitive" } },
        { founderPrincipal: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
      ];
    }

    if (state) {
      where.state = { equals: state, mode: "insensitive" };
    }

    if (city) {
      where.city = { equals: city, mode: "insensitive" };
    }

    // Fetch surveys with pagination
    const [surveys, total] = await Promise.all([
      prisma.adminSurvey.findMany({
        where,
        orderBy: { [sortBy]: sortOrder },
        skip,
        take: limit,
      }),
      prisma.adminSurvey.count({ where }),
    ]);

    // Get unique states and cities for filtering
    const states = await prisma.adminSurvey.findMany({
      select: { state: true },
      distinct: ["state"],
      orderBy: { state: "asc" },
    });

    const cities = await prisma.adminSurvey.findMany({
      select: { city: true },
      distinct: ["city"],
      orderBy: { city: "asc" },
      where: state ? { state: { equals: state, mode: "insensitive" } } : {},
    });

    return NextResponse.json({
      surveys,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
      filters: {
        states: states.map((s: { state: string }) => s.state),
        cities: cities.map((c: { city: string }) => c.city),
      },
    });
  } catch (error) {
    console.error("Error fetching admin surveys:", error);
    return NextResponse.json(
      { error: "Failed to fetch admin surveys" },
      { status: 500 }
    );
  }
}

// POST: Create a new admin survey entry
export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

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

    const survey = await prisma.adminSurvey.create({
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

    return NextResponse.json(survey, { status: 201 });
  } catch (error) {
    console.error("Error creating admin survey:", error);
    return NextResponse.json(
      { error: "Failed to create admin survey" },
      { status: 500 }
    );
  }
}
