import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/contact-us/thread/[threadId]
 * Fetches all messages in a conversation thread.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ threadId: string }> }
) {
  try {
    const { threadId } = await params;

    if (!threadId) {
      return NextResponse.json(
        { error: "Thread ID is required" },
        { status: 400 }
      );
    }

    const messages = await prisma.contactUs.findMany({
      where: { threadId },
      orderBy: { createdAt: "asc" },
    });

    if (!messages.length) {
      return NextResponse.json({ error: "Thread not found" }, { status: 404 });
    }

    const originalInquiry =
      messages.find((m) => m.conversationType === "NEW_INQUIRY") || messages[0];

    return NextResponse.json({
      success: true,
      threadId,
      originalInquiry: {
        id: originalInquiry.id,
        name: originalInquiry.name,
        email: originalInquiry.email,
        subject: originalInquiry.subject,
        message: originalInquiry.message,
        createdAt: originalInquiry.createdAt,
      },
      messages: messages.map((msg) => ({
        id: msg.id,
        name: msg.name,
        email: msg.email,
        subject: msg.subject,
        message: msg.message,
        conversationType: msg.conversationType,
        createdAt: msg.createdAt,
        status: msg.status,
      })),
      latestMessage: messages[messages.length - 1],
    });
  } catch (error) {
    console.error("GET thread error:", error);
    return NextResponse.json(
      { error: "Failed to fetch thread" },
      { status: 500 }
    );
  }
}
