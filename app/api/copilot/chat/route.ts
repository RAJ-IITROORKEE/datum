import { OpenRouter } from "@openrouter/sdk";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { getMCPClient } from "@/lib/mcp/client";
import { enqueueCommandForUser, waitForCommandResult } from "@/lib/revit-agent/jobs";

const openrouter = new OpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY!,
});

function isStatusIntent(input: string): boolean {
  const text = input.toLowerCase();
  const checks = [
    "mcp status",
    "server status",
    "connection status",
    "are you connected",
    "are tools connected",
    "tools connected",
    "revit connected",
    "agent connected",
    "how many tools",
    "tool count",
  ];
  return checks.some((c) => text.includes(c));
}

async function buildImmediateSseResponse(content: string, conversationId: string) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content })}\n\n`));
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ conversationId })}\n\n`));
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

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

    const userText = typeof userMessage?.content === "string" ? userMessage.content.trim() : "";
    const manualToolPrefix = "/run";

    if (userText.startsWith(manualToolPrefix)) {
      const parts = userText.slice(manualToolPrefix.length).trim();
      const spaceIndex = parts.indexOf(" ");

      if (spaceIndex <= 0) {
        const helpText =
          "Manual tool mode: use `/run <tool_name> <json_args>`. Example: /run get_levels_list {}";

        await prisma.chatMessage.create({
          data: {
            conversationId: conversation.id,
            role: "assistant",
            content: helpText,
          },
        });

        return buildImmediateSseResponse(helpText, conversation.id);
      }

      const toolName = parts.slice(0, spaceIndex).trim();
      const argsRaw = parts.slice(spaceIndex + 1).trim();
      let parsedArgs: Record<string, unknown> = {};

      try {
        parsedArgs = argsRaw ? JSON.parse(argsRaw) : {};
      } catch {
        const errorText = "Invalid JSON args. Example: /run create_wall {\"walls\":[...]}";
        await prisma.chatMessage.create({
          data: {
            conversationId: conversation.id,
            role: "assistant",
            content: errorText,
          },
        });

        return buildImmediateSseResponse(errorText, conversation.id);
      }

      const job = await enqueueCommandForUser(userId, toolName, parsedArgs);
      const result = await waitForCommandResult(job.id);
      const resultText = result.success
        ? `Tool ${toolName} executed successfully:\n${JSON.stringify(result.result, null, 2)}`
        : `Tool ${toolName} failed: ${result.error}`;

      await prisma.chatMessage.create({
        data: {
          conversationId: conversation.id,
          role: "assistant",
          content: resultText,
        },
      });

      return buildImmediateSseResponse(resultText, conversation.id);
    }

    const recentAgentSession = await prisma.revitAgentSession.findFirst({
      where: { clerkUserId: userId },
      orderBy: { lastSeenAt: "desc" },
    });
    const revitConnected =
      !!recentAgentSession &&
      Date.now() - new Date(recentAgentSession.lastSeenAt).getTime() <= 30_000;

    // Get MCP tools information if enabled
    let mcpSystemMessage = "";
    let mcpConnected = false;
    let mcpToolCount = 0;
    let mcpReason = "";
    if (enableMCP) {
      try {
        const mcpClient = getMCPClient();
        const isHealthy = await mcpClient.testConnection();
        const tools = await mcpClient.listTools();

        mcpConnected = isHealthy && tools.length > 0;
        mcpToolCount = tools.length;

        if (mcpConnected) {
          const toolsList = tools.slice(0, 50).map(t => `- ${t.name}: ${t.description}`).join('\n');
          mcpSystemMessage = `\n\nMCP_CONNECTION_STATUS=CONNECTED\nMCP_TOOL_COUNT=${mcpToolCount}\nREVIT_AGENT_STATUS=${revitConnected ? "CONNECTED" : "DISCONNECTED"}\n\nYou have access to ${mcpToolCount} Revit MCP tools for BIM automation and architectural design:\n\n${toolsList}\n\nWhen users ask for Revit-related tasks:
- If REVIT_AGENT_STATUS=CONNECTED, you can state that execution from Copilot is available.
- If REVIT_AGENT_STATUS=DISCONNECTED, instruct user to connect Datum Revit Agent and keep Revit open.
Do not claim MCP is disconnected when MCP_CONNECTION_STATUS=CONNECTED.`;
        } else {
          mcpSystemMessage = `\n\nMCP_CONNECTION_STATUS=DISCONNECTED\nREVIT_AGENT_STATUS=${revitConnected ? "CONNECTED" : "DISCONNECTED"}\nNote: MCP tools connection is currently unavailable.`;
        }
      } catch (error) {
        console.error("Failed to load MCP tools:", error);
        mcpReason = error instanceof Error ? error.message : "Unknown MCP error";
        mcpSystemMessage = `\n\nMCP_CONNECTION_STATUS=DISCONNECTED\nREVIT_AGENT_STATUS=${revitConnected ? "CONNECTED" : "DISCONNECTED"}\nNote: MCP tools connection is currently unavailable.`;
      }
    }

    if (isStatusIntent(userText)) {
      const statusText = `Connection Status\n- MCP Server: ${mcpConnected ? "Connected" : "Disconnected"}\n- MCP Tools: ${mcpToolCount}\n- Revit Agent: ${revitConnected ? "Connected" : "Disconnected"}${recentAgentSession?.deviceName ? ` (${recentAgentSession.deviceName})` : ""}${mcpConnected ? "" : mcpReason ? `\n- MCP Reason: ${mcpReason}` : ""}\n\nTo execute a tool now, use:\n/run <tool_name> <json_args>\nExample: /run get_levels_list {}`;

      await prisma.chatMessage.create({
        data: {
          conversationId: conversation.id,
          role: "assistant",
          content: statusText,
        },
      });

      return buildImmediateSseResponse(statusText, conversation.id);
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
