import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const archived = searchParams.get("archived");
    
    const whereClause: any = { userId };
    if (archived === "true") {
      whereClause.isArchived = true;
    } else if (archived === "false") {
      whereClause.isArchived = false;
    }

    const conversations = await prisma.chatConversation.findMany({
      where: whereClause,
      orderBy: { updatedAt: "desc" },
      take: 50,
    });

    // Ensure all conversations have default values for fields that may not exist in older documents
    const normalizedConversations = conversations.map(conv => ({
      ...conv,
      isArchived: conv.isArchived ?? false,
      tags: conv.tags ?? [],
      model: conv.model ?? "anthropic/claude-sonnet-4.5",
    }));

    return NextResponse.json(normalizedConversations);
  } catch (error) {
    console.error("Get conversations error:", error);
    // Log the full error for debugging
    if (error instanceof Error) {
      console.error("Error details:", error.message, error.stack);
    }
    return NextResponse.json(
      { error: "Internal server error", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const conversationId = searchParams.get("id");

    if (!conversationId) {
      return NextResponse.json(
        { error: "Conversation ID required" },
        { status: 400 }
      );
    }

    // Verify ownership
    const conversation = await prisma.chatConversation.findUnique({
      where: { id: conversationId },
    });

    if (!conversation || conversation.userId !== userId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Delete conversation (messages will be cascade deleted)
    await prisma.chatConversation.delete({
      where: { id: conversationId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete conversation error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
