import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendEmail, buildConversationHistoryHtml } from "@/lib/email";

/**
 * POST /api/contact-us/send-email
 * Admin sends a reply email to the user.
 * Creates an ADMIN_REPLY record and sends the threaded reply email.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { to, subject, message, replyMessage, userName, status, contactId, threadId } = body;

    // Support both direct fields and the replyMessage shorthand from admin UI
    let resolvedTo = to;
    let resolvedSubject = subject;
    let resolvedMessage = message || replyMessage;
    let resolvedUserName = userName;

    // If admin passed only contactId + replyMessage, resolve the rest from DB
    if (contactId && (!resolvedTo || !resolvedSubject)) {
      const contact = await prisma.contactUs.findUnique({
        where: { id: contactId },
      });
      if (!contact) {
        return NextResponse.json({ error: "Contact not found" }, { status: 404 });
      }
      resolvedTo = resolvedTo || contact.email;
      resolvedSubject = resolvedSubject || contact.subject;
      resolvedUserName = resolvedUserName || contact.name;
    }

    if (!resolvedTo || !resolvedSubject || !resolvedMessage) {
      return NextResponse.json(
        { error: "Missing required fields: to, subject, message" },
        { status: 400 }
      );
    }

    // Resolve threadId — retrieve from DB if not provided
    let finalThreadId = threadId;
    if (contactId && !finalThreadId) {
      const contact = await prisma.contactUs.findUnique({
        where: { id: contactId },
      });
      if (contact) {
        finalThreadId = contact.threadId;
      }
    }

    // Generate new threadId for legacy contacts that don't have one
    if (!finalThreadId && contactId) {
      finalThreadId = `thread_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      await prisma.contactUs.update({
        where: { id: contactId },
        data: { threadId: finalThreadId },
      });
    }

    const baseUrl =
      process.env.NEXT_PUBLIC_APP_URL ||
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

    const replyUrl = finalThreadId
      ? `${baseUrl}/contacts/reply?threadId=${finalThreadId}&email=${encodeURIComponent(resolvedTo)}&name=${encodeURIComponent(resolvedUserName || "User")}`
      : `${baseUrl}/contacts`;

    // Create ADMIN_REPLY record with full conversation history appended
    if (contactId && finalThreadId) {
      const allThreadMessages = await prisma.contactUs.findMany({
        where: { threadId: finalThreadId },
        orderBy: { createdAt: "asc" },
      });

      let conversationHistory = "\n\n------- Conversation History -------\n";
      for (const msg of allThreadMessages) {
        const typeLabel =
          msg.conversationType === "NEW_INQUIRY"
            ? "Original Inquiry"
            : msg.conversationType === "ADMIN_REPLY"
            ? "Datum Team Reply"
            : "User Reply";
        conversationHistory += `\n[${typeLabel}] - ${new Date(msg.createdAt).toLocaleString("en-IN")}:\n${msg.message.split("\n\n-------")[0]}\n`;
      }

      const adminEmail =
        process.env.EMAIL_FROM || process.env.EMAIL_USER || "support@datum.app";

      await prisma.contactUs.create({
        data: {
          name: "Datum Team",
          email: adminEmail,
          subject: `Re: ${resolvedSubject}`,
          message: `${resolvedMessage}${conversationHistory}`,
          status: "RESOLVED",
          threadId: finalThreadId,
          parentId: contactId,
          conversationType: "ADMIN_REPLY",
        },
      });

      // Build HTML conversation history for the email
      const conversationHistoryHtml = buildConversationHistoryHtml(
        allThreadMessages.map((m) => ({
          conversationType: m.conversationType,
          name: m.name,
          message: m.message,
          createdAt: m.createdAt,
        }))
      );

      const result = await sendEmail({
        to: resolvedTo,
        template: "contact_reply",
        data: {
          userName: resolvedUserName || "there",
          subject: resolvedSubject,
          message: resolvedMessage,
          status,
          replyUrl,
          conversationHistoryHtml,
        },
        source: "contact-us",
        sentBy: req.headers.get("x-admin-email") || "Admin",
        metadata: {
          recipientEmail: resolvedTo,
          status: status || "PENDING",
          userName: resolvedUserName || "User",
          threadId: finalThreadId,
          contactId,
        },
      });

      if (result.success) {
        return NextResponse.json({
          success: true,
          message: "Email sent successfully",
          messageId: result.messageId,
        });
      }

      return NextResponse.json(
        { error: result.error || "Failed to send email" },
        { status: 500 }
      );
    }

    // Fallback: no contactId — send without creating DB record
    const result = await sendEmail({
      to: resolvedTo,
      template: "contact_reply",
      data: {
        userName: resolvedUserName || "there",
        subject: resolvedSubject,
        message: resolvedMessage,
        status,
        replyUrl,
      },
      source: "contact-us",
      sentBy: req.headers.get("x-admin-email") || "Admin",
    });

    if (result.success) {
      return NextResponse.json({
        success: true,
        message: "Email sent successfully",
        messageId: result.messageId,
      });
    }

    return NextResponse.json(
      { error: result.error || "Failed to send email" },
      { status: 500 }
    );
  } catch (error) {
    console.error("❌ contact-us send-email error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
