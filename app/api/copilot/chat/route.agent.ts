/**
 * Copilot Chat API Route - Agentic Version
 * 
 * This route uses the modular agentic system for handling
 * chat interactions with autonomous tool execution.
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import {
  runAgentWithPlanning,
  fetchAvailableTools,
  createSseStream,
  createSseData,
  SSE_HEADERS,
  createLogger,
  AgentProgressEvent,
  AgentTool,
} from "@/lib/agent";
import { OpenRouter } from "@openrouter/sdk";

// ============================================================================
// CONFIGURATION
// ============================================================================

const openrouter = new OpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY!,
});

// ============================================================================
// INTENT DETECTION
// ============================================================================

function containsAny(text: string, keywords: string[]): boolean {
  return keywords.some((keyword) => text.includes(keyword));
}

function isStatusIntent(input: string): boolean {
  const text = input.toLowerCase();
  const checks = [
    "mcp status", "server status", "connection status",
    "are you connected", "are tools connected", "tools connected",
    "revit connected", "agent connected", "how many tools", "tool count",
  ];
  return checks.some((c) => text.includes(c));
}

function isManualToolCommand(input: string): boolean {
  return input.trim().startsWith("/run");
}

function requiresAgenticExecution(input: string): boolean {
  const text = input.toLowerCase();
  
  // Build/create intents with Revit objects
  const hasBuildVerb = containsAny(text, [
    "create", "build", "make", "design", "construct", 
    "generate", "add", "draw", "model", "place"
  ]);
  const hasRevitObject = containsAny(text, [
    "wall", "walls", "door", "doors", "window", "windows", 
    "room", "rooms", "floor", "floors", "ceiling", "roof",
    "column", "columns", "beam", "beams", "house", "apartment",
    "flat", "layout", "floor plan", "plan", "building",
    "bhk", "bedroom", "kitchen", "bathroom", "living", "dining"
  ]);
  
  // Multi-step indicators
  const hasMultiStepIndicators = containsAny(text, [
    "step by step", "automatically", "end to end", "complete",
    "entire", "whole", "then", "after that", "followed by", "and also"
  ]);
  
  // Analysis/scan requests
  const hasAnalysisIntent = containsAny(text, [
    "analyze", "analyse", "scan", "review plan", "check plan"
  ]);
  
  return (hasBuildVerb && hasRevitObject) || hasMultiStepIndicators || hasAnalysisIntent;
}

// ============================================================================
// TITLE GENERATION
// ============================================================================

async function generateChatTitle(userMessage: string): Promise<string> {
  try {
    const response = await openrouter.chat.send({
      chatGenerationParams: {
        model: "anthropic/claude-3-haiku",
        messages: [
          {
            role: "system",
            content: "Generate a short, concise title (max 6 words) for a chat conversation based on the user's first message. Only return the title, nothing else. Do not use quotes.",
          },
          { role: "user", content: userMessage },
        ],
        maxTokens: 50,
        temperature: 0.3,
      },
    });

    const title = response.choices?.[0]?.message?.content?.trim();
    if (title && title.length > 0) {
      return title.length > 50 ? title.substring(0, 47) + "..." : title;
    }
    return userMessage.substring(0, 50);
  } catch (error) {
    console.error("Failed to generate title:", error);
    return userMessage.substring(0, 50);
  }
}

// ============================================================================
// STREAMING RESPONSE HELPERS
// ============================================================================

function buildImmediateResponse(content: string, conversationId: string): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(createSseData({ content })));
      controller.enqueue(encoder.encode(createSseData({ conversationId })));
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });
  
  return new Response(stream, { headers: SSE_HEADERS });
}

// ============================================================================
// CONNECTION STATUS
// ============================================================================

async function checkConnections(userId: string): Promise<{
  mcpConnected: boolean;
  legacyConnected: boolean;
  revitAvailable: boolean;
  mcpTools: AgentTool[];
}> {
  let mcpConnected = false;
  let mcpTools: AgentTool[] = [];
  
  try {
    const result = await fetchAvailableTools();
    mcpConnected = result.connected;
    mcpTools = result.tools;
  } catch {
    mcpConnected = false;
  }
  
  // Check legacy agent heartbeat
  let legacyConnected = false;
  try {
    const recentSession = await prisma.revitAgentSession.findFirst({
      where: { clerkUserId: userId },
      orderBy: { lastSeenAt: "desc" },
    });
    legacyConnected = 
      !!recentSession && 
      Date.now() - new Date(recentSession.lastSeenAt).getTime() <= 30_000;
  } catch {
    legacyConnected = false;
  }
  
  return {
    mcpConnected,
    legacyConnected,
    revitAvailable: mcpConnected || legacyConnected,
    mcpTools,
  };
}

// ============================================================================
// MAIN ROUTE HANDLER
// ============================================================================

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { messages, model, conversationId, enableMCP = true } = await req.json();

    // Get or create conversation
    let conversation;
    if (conversationId) {
      conversation = await prisma.chatConversation.findUnique({
        where: { id: conversationId },
      });
    } else {
      const firstMessage = messages[0]?.content || "New Chat";
      const title = await generateChatTitle(
        typeof firstMessage === "string" ? firstMessage : JSON.stringify(firstMessage)
      );
      conversation = await prisma.chatConversation.create({
        data: {
          userId,
          title,
          model: model || "anthropic/claude-sonnet-4.5",
        },
      });
    }

    if (!conversation) {
      return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
    }

    // Save user message
    const userMessage = messages[messages.length - 1];
    await prisma.chatMessage.create({
      data: {
        conversationId: conversation.id,
        role: "user",
        content: userMessage.content,
      },
    });

    const userText = typeof userMessage?.content === "string" 
      ? userMessage.content.trim() 
      : "";
    
    // Check connections
    const connections = await checkConnections(userId);
    
    // ========================================================================
    // ROUTE 1: Manual Tool Command (/run)
    // ========================================================================
    if (isManualToolCommand(userText)) {
      return handleManualToolCommand(
        userId, 
        userText, 
        conversation.id
      );
    }
    
    // ========================================================================
    // ROUTE 2: Status Check
    // ========================================================================
    if (isStatusIntent(userText)) {
      const statusText = formatConnectionStatus(connections);
      await saveAssistantMessage(conversation.id, statusText);
      return buildImmediateResponse(statusText, conversation.id);
    }
    
    // ========================================================================
    // ROUTE 3: Agentic Execution
    // ========================================================================
    if (requiresAgenticExecution(userText) && enableMCP) {
      if (!connections.revitAvailable) {
        const errorMsg = "I can execute this in Revit, but no active connection is available. Please connect Cloud Relay or the local agent.";
        await saveAssistantMessage(conversation.id, errorMsg);
        return buildImmediateResponse(errorMsg, conversation.id);
      }
      
      return handleAgenticExecution(
        userId,
        userText,
        messages,
        conversation.id,
        connections.mcpTools
      );
    }
    
    // ========================================================================
    // ROUTE 4: Default Chat (Streaming LLM Response)
    // ========================================================================
    return handleDefaultChat(
      messages,
      model,
      conversation.id,
      connections
    );
    
  } catch (error) {
    console.error("Chat API error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ============================================================================
// HANDLER FUNCTIONS
// ============================================================================

async function handleManualToolCommand(
  userId: string,
  userText: string,
  conversationId: string
): Promise<Response> {
  const parts = userText.slice("/run".length).trim();
  const spaceIndex = parts.indexOf(" ");
  
  if (spaceIndex <= 0) {
    const helpText = "Manual tool mode: use `/run <tool_name> <json_args>`. Example: /run get_levels_list {}";
    await saveAssistantMessage(conversationId, helpText);
    return buildImmediateResponse(helpText, conversationId);
  }
  
  const toolName = parts.slice(0, spaceIndex).trim();
  const argsRaw = parts.slice(spaceIndex + 1).trim();
  
  let parsedArgs: Record<string, unknown> = {};
  try {
    parsedArgs = argsRaw ? JSON.parse(argsRaw) : {};
  } catch {
    const errorText = "Invalid JSON args. Example: /run create_wall {\"walls\":[...]}";
    await saveAssistantMessage(conversationId, errorText);
    return buildImmediateResponse(errorText, conversationId);
  }
  
  // Execute the tool
  const { executeTool } = await import("@/lib/agent");
  const result = await executeTool(userId, toolName, parsedArgs);
  
  const resultText = result.success
    ? `Tool ${toolName} executed successfully via ${result.transport?.toUpperCase()}:\n${JSON.stringify(result.result, null, 2)}`
    : `Tool ${toolName} failed via ${result.transport?.toUpperCase()}: ${result.error}`;
  
  await saveAssistantMessage(conversationId, resultText);
  return buildImmediateResponse(resultText, conversationId);
}

async function handleAgenticExecution(
  userId: string,
  goal: string,
  messages: Array<{ role: string; content: string }>,
  conversationId: string,
  tools: AgentTool[]
): Promise<Response> {
  const { stream, controller } = createSseStream();
  const logger = createLogger(process.env.NODE_ENV === "development");
  
  // Build context from recent messages
  const context = messages.slice(-5).map((m) => 
    `${m.role}: ${typeof m.content === "string" ? m.content.slice(0, 300) : JSON.stringify(m.content).slice(0, 300)}`
  ).join("\n");
  
  // Run in background
  (async () => {
    try {
      const result = await runAgentWithPlanning({
        userId,
        goal,
        tools,
        context,
        config: {
          debug: process.env.NODE_ENV === "development",
          model: "anthropic/claude-sonnet-4",
        },
        logger,
        onProgress: (event: AgentProgressEvent) => {
          controller.sendProgress(event);
        },
      });
      
      // Send final result
      const finalContent = result.success
        ? result.finalAnswer || "Task completed successfully."
        : `Execution failed: ${result.error}`;
      
      controller.sendContent(finalContent);
      
      // Save to database
      await saveAssistantMessage(conversationId, finalContent);
      
      controller.sendConversationId(conversationId);
      controller.close();
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      controller.error(errorMsg);
      await saveAssistantMessage(conversationId, `Error: ${errorMsg}`);
    }
  })();
  
  return new Response(stream, { headers: SSE_HEADERS });
}

async function handleDefaultChat(
  messages: Array<{ role: string; content: string }>,
  model: string | undefined,
  conversationId: string,
  connections: Awaited<ReturnType<typeof checkConnections>>
): Promise<Response> {
  // Build system message with MCP context
  const mcpContext = connections.mcpConnected && connections.mcpTools.length > 0
    ? `\n\nYou have access to ${connections.mcpTools.length} Revit tools for BIM automation:\n${connections.mcpTools.map((t) => `- ${t.name}: ${t.description}`).join("\n")}\n\nFor executable tasks, guide users on how to use these tools or use agentic mode.`
    : "";
  
  const systemMessage = `You are Datum AI Copilot, an intelligent assistant specialized in architecture, BIM, and Revit automation.${mcpContext}

Provide helpful, accurate responses and guide users on how to use available tools when relevant.`;

  const messagesWithSystem = [
    { role: "system" as const, content: systemMessage },
    ...messages.map((m: { role: string; content: string }) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
  ];

  // Stream the response
  const stream = await openrouter.chat.send({
    chatGenerationParams: {
      model: model || "anthropic/claude-sonnet-4.5",
      messages: messagesWithSystem,
      stream: true,
    },
  });

  const encoder = new TextEncoder();
  let fullResponse = "";

  const readableStream = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of stream) {
          const content = chunk.choices[0]?.delta?.content;
          if (content) {
            fullResponse += content;
            controller.enqueue(encoder.encode(createSseData({ content })));
          }
        }

        // Save response
        await saveAssistantMessage(conversationId, fullResponse);

        controller.enqueue(encoder.encode(createSseData({ conversationId })));
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      } catch (error) {
        console.error("Streaming error:", error);
        controller.error(error);
      }
    },
  });

  return new Response(readableStream, { headers: SSE_HEADERS });
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

async function saveAssistantMessage(conversationId: string, content: string): Promise<void> {
  await prisma.chatMessage.create({
    data: {
      conversationId,
      role: "assistant",
      content,
    },
  });
}

function formatConnectionStatus(
  connections: Awaited<ReturnType<typeof checkConnections>>
): string {
  return `Connection Status
- MCP Server: ${connections.mcpConnected ? "Connected" : "Disconnected"}
- MCP Tools: ${connections.mcpTools.length} available
- Legacy Agent: ${connections.legacyConnected ? "Connected" : "Disconnected"}
- Revit Execution: ${connections.revitAvailable ? "Available" : "Unavailable"}

${connections.mcpTools.length > 0 ? `Available tools: ${connections.mcpTools.map((t) => t.name).join(", ")}` : "No tools available."}

To execute a tool manually: /run <tool_name> <json_args>`;
}
