import { OpenRouter } from "@openrouter/sdk";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { getMCPClient } from "@/lib/mcp/client";

const openrouter = new OpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY!,
});

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { messages, model, conversationId, enableMCP = true } = await req.json();

    // Create or update conversation
    let conversation;
    if (conversationId) {
      conversation = await prisma.chatConversation.findUnique({
        where: { id: conversationId },
      });
    } else {
      // Create new conversation with the first user message as title
      const firstMessage = messages[0]?.content || "New Chat";
      const title = firstMessage.substring(0, 50);
      
      conversation = await prisma.chatConversation.create({
        data: {
          userId,
          title,
          model: model || "anthropic/claude-sonnet-4.5",
        },
      });
    }

    if (!conversation) {
      return NextResponse.json(
        { error: "Conversation not found" },
        { status: 404 }
      );
    }

    // Save user message to database
    const userMessage = messages[messages.length - 1];
    await prisma.chatMessage.create({
      data: {
        conversationId: conversation.id,
        role: "user",
        content: userMessage.content,
      },
    });

    // Get MCP tools information if enabled
    let mcpSystemMessage = "";
    if (enableMCP) {
      try {
        const mcpClient = getMCPClient();
        const tools = await mcpClient.listTools();
        
        if (tools.length > 0) {
          const toolsList = tools.slice(0, 50).map(t => `- ${t.name}: ${t.description}`).join('\n');
          mcpSystemMessage = `\n\nYou have access to ${tools.length} Revit MCP tools for BIM automation and architectural design:\n\n${toolsList}\n\nWhen users ask for Revit-related tasks, explain what can be done with these tools. The MCP server is connected and ready to execute Revit automation commands.`;
        }
      } catch (error) {
        console.error("Failed to load MCP tools:", error);
        mcpSystemMessage = "\n\nNote: MCP tools connection is currently unavailable.";
      }
    }

    // Prepare messages with system context
    const systemMessage = `You are Datum AI Copilot, an intelligent assistant specialized in architecture, BIM, and Revit automation.${mcpSystemMessage}

Provide helpful, accurate responses and guide users on how to use available tools when relevant.`;

    const messagesWithSystem = [
      { role: "system", content: systemMessage },
      ...messages,
    ];

    // Stream the response from OpenRouter
    const stream = await openrouter.chat.send({
      chatGenerationParams: {
        model: model || "anthropic/claude-sonnet-4.5",
        messages: messagesWithSystem,
        stream: true,
      },
    });

    // Create a readable stream to send to the client
    const encoder = new TextEncoder();
    let fullResponse = "";

    const readableStream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            const content = chunk.choices[0]?.delta?.content;
            if (content) {
              fullResponse += content;
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ content })}\n\n`)
              );
            }

            // Send usage information if available
            if (chunk.usage) {
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({ usage: chunk.usage })}\n\n`
                )
              );
            }
          }

          // Save assistant response to database
          await prisma.chatMessage.create({
            data: {
              conversationId: conversation.id,
              role: "assistant",
              content: fullResponse,
            },
          });

          // Send conversation ID to client
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ conversationId: conversation.id })}\n\n`
            )
          );

          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        } catch (error) {
          console.error("Streaming error:", error);
          controller.error(error);
        }
      },
    });

    return new Response(readableStream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    console.error("Chat API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
