import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendEmail, buildConversationHistoryHtml } from "@/lib/email";

/**
 * POST /api/contact-us/reply
 * Handles user replies to admin emails — creates a USER_REPLY thread entry
 * and notifies the Datum admin.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { threadId, parentId, user_name, user_email, message } = body;

    if (!threadId || !user_email || !message || !user_name) {
      return NextResponse.json(
        { error: "Missing required fields: threadId, user_email, message, user_name" },
        { status: 400 }
      );
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(user_email)) {
      return NextResponse.json({ error: "Invalid email format" }, { status: 400 });
    }

    // Verify thread exists
    const threadExists = await prisma.contactUs.findFirst({
      where: { threadId },
    });

    if (!threadExists) {
      return NextResponse.json({ error: "Thread not found" }, { status: 404 });
    }

    // Rate limiting for user replies
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const messagesToday = await prisma.contactUs.count({
      where: {
        email: user_email,
        conversationType: "USER_REPLY",
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

    // Fetch all thread messages for conversation history
    const allThreadMessages = await prisma.contactUs.findMany({
      where: { threadId },
      orderBy: { createdAt: "asc" },
    });

    // Build plain-text conversation history
    let conversationHistory = "\n\n------- Conversation History -------\n";
    for (const msg of allThreadMessages) {
      const typeLabel =
        msg.conversationType === "NEW_INQUIRY"
          ? "Original Inquiry"
          : msg.conversationType === "ADMIN_REPLY"
          ? "Datum Team Reply"
          : "User Reply";
      conversationHistory += `\n[${typeLabel}] - ${new Date(msg.createdAt).toLocaleString("en-IN")}:\n${msg.message}\n`;
    }

    const fullMessage = `${message}${conversationHistory}`;

    const reply = await prisma.contactUs.create({
      data: {
        name: user_name,
        email: user_email,
        subject: `Re: ${threadExists.subject}`,
        message: fullMessage,
        status: "PENDING",
        threadId,
        parentId: parentId || undefined,
        conversationType: "USER_REPLY",
        dailyMessageCount: messagesToday + 1,
        lastMessageDate: new Date(),
      },
    });

    // Notify admin
    const adminEmail =
      process.env.ADMIN_EMAIL ||
      process.env.EMAIL_USER ||
      "admin@datum.app";

    const conversationHistoryHtml = buildConversationHistoryHtml(
      allThreadMessages.map((m) => ({
        conversationType: m.conversationType,
        name: m.name,
        message: m.message,
        createdAt: m.createdAt,
      }))
    );

    await sendEmail({
      to: adminEmail,
      template: "contact_user_reply_admin",
      data: {
        userName: user_name,
        userEmail: user_email,
        subject: threadExists.subject,
        message,
        threadId,
        conversationHistoryHtml,
      },
      source: "contact-reply",
      sentBy: user_email,
      metadata: { threadId, parentId, contactId: reply.id },
    });

    return NextResponse.json({
      success: true,
      message: "Reply sent successfully",
      data: reply,
    });
  } catch (error) {
    console.error("POST ContactUs Reply error:", error);
    return NextResponse.json(
      { error: "Failed to send reply" },
      { status: 500 }
    );
  }
}
