import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET — all contact messages (admin only, protect in middleware)
export async function GET() {
  try {
    const contacts = await prisma.contactUs.findMany({
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ success: true, data: contacts });
  } catch (error) {
    console.error("GET ContactUs error:", error);
    return new NextResponse("Failed to fetch contacts", { status: 500 });
  }
}

// POST — new contact message or thread reply
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { user_name, user_email, subject, message, threadId, parentId } = body;

    // Validate required fields
    if (!user_name || !user_email || !subject || !message) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(user_email)) {
      return NextResponse.json(
        { error: "Invalid email format" },
        { status: 400 }
      );
    }

    // Rate limiting — max 3 messages per day per email
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const messagesToday = await prisma.contactUs.count({
      where: {
        email: user_email,
        createdAt: { gte: today },
      },
    });

    if (messagesToday >= 3) {
      return NextResponse.json(
        {
          error:
            "Daily limit exceeded. You can send up to 3 messages per day. Please try again tomorrow.",
          limitExceeded: true,
        },
        { status: 429 }
      );
    }

    // Generate threadId for new conversations
    const isThreadReply = !!threadId;
    const finalThreadId =
      threadId ||
      `thread_${Date.now()}_${Math.random().toString(36).substring(7)}`;

    // Append quoted parent message if replying
    let finalMessage = message;
    if (isThreadReply && parentId) {
      const parentMessage = await prisma.contactUs.findUnique({
        where: { id: parentId },
      });
      if (parentMessage) {
        finalMessage = `${message}\n\n------- Previous Message -------\n${parentMessage.message}`;
      }
    }

    const contact = await prisma.contactUs.create({
      data: {
        name: user_name,
        email: user_email,
        subject,
        message: finalMessage,
        status: "PENDING",
        threadId: finalThreadId,
        parentId: parentId || undefined,
        conversationType: isThreadReply ? "USER_REPLY" : "NEW_INQUIRY",
        dailyMessageCount: messagesToday + 1,
        lastMessageDate: new Date(),
      },
    });

    return NextResponse.json({
      success: true,
      message: "Contact form submitted successfully",
      data: contact,
      threadId: finalThreadId,
    });
  } catch (error) {
    console.error("POST ContactUs error:", error);
    return NextResponse.json(
      { error: "Failed to create contact" },
      { status: 500 }
    );
  }
}
