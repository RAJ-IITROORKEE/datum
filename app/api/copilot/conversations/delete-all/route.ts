import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";

// DELETE - Delete all conversations for a user
export async function DELETE(req: NextRequest) {
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
    }

    // Delete all conversations (messages will be cascade deleted)
    const result = await prisma.chatConversation.deleteMany({
      where: whereClause,
    });

    return NextResponse.json({ 
      success: true, 
      deletedCount: result.count 
    });
  } catch (error) {
    console.error("Delete all conversations error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
