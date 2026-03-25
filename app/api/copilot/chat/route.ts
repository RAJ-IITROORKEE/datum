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

type AgentStage = "planning" | "executing" | "completed" | "error";
type AgentEventKind = "analysis" | "tool";

interface AgentProgressEvent {
  stage: AgentStage;
  message: string;
  toolName?: string;
  kind: AgentEventKind;
  details?: string;
  timestamp: string;
}

interface AgentToolCall {
  toolName: string;
  args: Record<string, unknown>;
}

function resolveToolAlias(toolName: string): string {
  const normalized = toolName.trim().toLowerCase();
  const aliases: Record<string, string> = {
    analyze_layout_design: "layout_analysis",
    analyse_layout_design: "layout_analysis",
    analyze_layout: "layout_analysis",
    get_levels: "get_levels_list",
    create_walls: "create_wall",
  };

  return aliases[normalized] || toolName;
}

function normalizeCreateWallArgs(args: Record<string, unknown>): Record<string, unknown> {
  const walls = args.walls;
  if (!Array.isArray(walls)) {
    return args;
  }

  const normalizedWalls = walls.map((wall) => {
    if (!wall || typeof wall !== "object") return wall;
    const typedWall = wall as Record<string, unknown>;

    if (
      typedWall.locationLine ||
      !typedWall.startPoint ||
      !typedWall.endPoint
    ) {
      return wall;
    }

    const baseLevelIdRaw = typedWall.levelId;
    let baseLevelId = 1;
    if (typeof baseLevelIdRaw === "number") {
      baseLevelId = baseLevelIdRaw;
    } else if (typeof baseLevelIdRaw === "string" && /^\d+$/.test(baseLevelIdRaw)) {
      baseLevelId = Number(baseLevelIdRaw);
    }

    const heightRaw = typedWall.height;
    let unconnectedHeight = 3000;
    if (typeof heightRaw === "number") {
      unconnectedHeight = heightRaw;
    } else if (typeof heightRaw === "string" && /^\d+$/.test(heightRaw)) {
      unconnectedHeight = Number(heightRaw);
    }

    return {
      locationLine: {
        startPoint: typedWall.startPoint,
        endPoint: typedWall.endPoint,
      },
      baseLevelId,
      unconnectedHeight,
      isStructural: false,
    };
  });

  return {
    ...args,
    walls: normalizedWalls,
  };
}

function emitContentChunk(
  controller: ReadableStreamDefaultController<Uint8Array>,
  encoder: TextEncoder,
  content: string
) {
  controller.enqueue(encoder.encode(createSseData({ content })));
}

function is2BhkBuildIntent(input: string): boolean {
  const text = input.toLowerCase();
  return (
    containsAny(text, ["2bhk", "2 bhk", "two bedroom", "flat layout"]) &&
    containsAny(text, ["create", "build", "make", "start", "design"])
  );
}

function has2BhkIntentInContext(messages: Array<{ role: string; content: unknown }>): boolean {
  const joined = messages
    .map((message) => (typeof message.content === "string" ? message.content : ""))
    .join("\n")
    .toLowerCase();

  return containsAny(joined, ["2bhk", "2 bhk", "two bedroom", "flat layout", "simple 2bhk"]);
}

function extractFirstLevelId(result: unknown): number | null {
  const raw = JSON.stringify(result ?? "");
  const levelRegex = /"(?:levelId|id)"\s*:\s*(\d+)/i;
  const match = levelRegex.exec(raw);
  if (!match?.[1]) return null;
  return Number(match[1]);
}

function buildSimple2BhkWalls(levelId: number) {
  return {
    walls: [
      {
        locationLine: {
          startPoint: { x: 0, y: 0, z: 0 },
          endPoint: { x: 14000, y: 0, z: 0 },
        },
        baseLevelId: levelId,
        unconnectedHeight: 3000,
        isStructural: false,
      },
      {
        locationLine: {
          startPoint: { x: 14000, y: 0, z: 0 },
          endPoint: { x: 14000, y: 12000, z: 0 },
        },
        baseLevelId: levelId,
        unconnectedHeight: 3000,
        isStructural: false,
      },
      {
        locationLine: {
          startPoint: { x: 14000, y: 12000, z: 0 },
          endPoint: { x: 0, y: 12000, z: 0 },
        },
        baseLevelId: levelId,
        unconnectedHeight: 3000,
        isStructural: false,
      },
      {
        locationLine: {
          startPoint: { x: 0, y: 12000, z: 0 },
          endPoint: { x: 0, y: 0, z: 0 },
        },
        baseLevelId: levelId,
        unconnectedHeight: 3000,
        isStructural: false,
      },
      {
        locationLine: {
          startPoint: { x: 0, y: 4000, z: 0 },
          endPoint: { x: 8000, y: 4000, z: 0 },
        },
        baseLevelId: levelId,
        unconnectedHeight: 3000,
        isStructural: false,
      },
      {
        locationLine: {
          startPoint: { x: 8000, y: 0, z: 0 },
          endPoint: { x: 8000, y: 8000, z: 0 },
        },
        baseLevelId: levelId,
        unconnectedHeight: 3000,
        isStructural: false,
      },
      {
        locationLine: {
          startPoint: { x: 4000, y: 8000, z: 0 },
          endPoint: { x: 14000, y: 8000, z: 0 },
        },
        baseLevelId: levelId,
        unconnectedHeight: 3000,
        isStructural: false,
      },
    ],
  };
}

function createSseData(payload: Record<string, unknown>): string {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

function emitAgentProgress(
  controller: ReadableStreamDefaultController<Uint8Array>,
  encoder: TextEncoder,
  event: AgentProgressEvent
) {
  controller.enqueue(encoder.encode(createSseData({ agent: event })));
}

function toAgentEvent(
  event: Omit<AgentProgressEvent, "timestamp">
): AgentProgressEvent {
  return {
    ...event,
    timestamp: new Date().toISOString(),
  };
}

function summarizeForDetails(value: unknown, maxLength = 1400): string {
  try {
    const raw = JSON.stringify(value, null, 2);
    if (raw.length <= maxLength) {
      return raw;
    }
    return `${raw.slice(0, maxLength)}\n...truncated`;
  } catch {
    if (value instanceof Error) {
      return value.message;
    }
    if (typeof value === "string") {
      return value;
    }
    return "Unable to serialize details";
  }
}

function detectJsonFromText(input: string): Record<string, unknown> | null {
  const trimmed = input.trim();
  const fencedRegex = /```(?:json)?\s*([\s\S]*?)```/i;
  const fenced = fencedRegex.exec(trimmed);
  const raw = fenced?.[1]?.trim() || trimmed;
  if (!raw.startsWith("{") || !raw.endsWith("}")) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return null;
  }

  return null;
}

function containsAny(text: string, keywords: string[]): boolean {
  return keywords.some((keyword) => text.includes(keyword));
}

function resolveAutoToolCall(
  userText: string,
  availableToolNames: Set<string>
): AgentToolCall | null {
  const text = userText.toLowerCase();
  const parsedJson = detectJsonFromText(userText);

  if (parsedJson?.walls && availableToolNames.has("create_wall")) {
    return { toolName: "create_wall", args: parsedJson };
  }

  if (
    parsedJson &&
    ["includeStructural", "includeArchitectural", "includeMEP", "includeAnnotations"].some(
      (k) => k in parsedJson
    ) &&
    availableToolNames.has("layout_analysis")
  ) {
    return { toolName: "layout_analysis", args: parsedJson };
  }

  if (
    containsAny(text, ["analyse", "analyze", "scan", "review plan", "check plan"]) &&
    availableToolNames.has("layout_analysis")
  ) {
    return {
      toolName: "layout_analysis",
      args: {
        includeStructural: true,
        includeArchitectural: true,
        includeMEP: false,
        includeAnnotations: false,
        checkCodeCompliance: true,
      },
    };
  }

  if (containsAny(text, ["level", "levels"]) && availableToolNames.has("get_levels_list")) {
    return { toolName: "get_levels_list", args: {} };
  }

  return null;
}

async function buildImmediateSseResponse(content: string, conversationId: string) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(createSseData({ content })));
      controller.enqueue(encoder.encode(createSseData({ conversationId })));
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

      const toolNameInput = parts.slice(0, spaceIndex).trim();
      const toolName = resolveToolAlias(toolNameInput);
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

      if (toolName === "create_wall") {
        parsedArgs = normalizeCreateWallArgs(parsedArgs);
      }

      const continuous2BhkFromManual =
        toolName === "layout_analysis" &&
        (containsAny(userText.toLowerCase(), ["2bhk", "2 bhk", "two bedroom", "flat"]) ||
          has2BhkIntentInContext(messages));

      if (continuous2BhkFromManual) {
        const recentManualAgentSession = await prisma.revitAgentSession.findFirst({
          where: { clerkUserId: userId },
          orderBy: { lastSeenAt: "desc" },
        });
        const manualRevitConnected =
          !!recentManualAgentSession &&
          Date.now() - new Date(recentManualAgentSession.lastSeenAt).getTime() <= 30_000;

        const encoder = new TextEncoder();
        let finalResponse = "";

        const readableStream = new ReadableStream({
          async start(controller) {
            try {
              emitAgentProgress(
                controller,
                encoder,
                toAgentEvent({
                  kind: "analysis",
                  stage: "planning",
                  message: "Received 2BHK request. Starting continuous agent workflow",
                  toolName: "layout_analysis",
                  details: "Flow: analyze → get levels → create walls",
                })
              );

              if (manualRevitConnected) {
                emitAgentProgress(
                  controller,
                  encoder,
                  toAgentEvent({
                    kind: "tool",
                    stage: "executing",
                    message: "Step 1/3: Analyzing current plan",
                    toolName: "layout_analysis",
                    details: summarizeForDetails(parsedArgs, 700),
                  })
                );
                emitContentChunk(controller, encoder, "Starting plan analysis in Revit...\n\n");

                const analysisJob = await enqueueCommandForUser(userId, "layout_analysis", parsedArgs);
                const analysisResult = await waitForCommandResult(analysisJob.id);
                if (!analysisResult.success) {
                  throw new Error(`Plan analysis failed: ${analysisResult.error}`);
                }

                emitAgentProgress(
                  controller,
                  encoder,
                  toAgentEvent({
                    kind: "analysis",
                    stage: "completed",
                    message: "Step 1/3 complete: plan analysis finished",
                    toolName: "layout_analysis",
                    details: summarizeForDetails(analysisResult.result, 900),
                  })
                );

                emitAgentProgress(
                  controller,
                  encoder,
                  toAgentEvent({
                    kind: "tool",
                    stage: "executing",
                    message: "Step 2/3: Reading available levels",
                    toolName: "get_levels_list",
                  })
                );
                emitContentChunk(controller, encoder, "Analysis complete. Fetching model levels and preparing wall placement...\n\n");

                const levelsJob = await enqueueCommandForUser(userId, "get_levels_list", {});
                const levelsResult = await waitForCommandResult(levelsJob.id);
                if (!levelsResult.success) {
                  throw new Error(`Level query failed: ${levelsResult.error}`);
                }

                const levelId = extractFirstLevelId(levelsResult.result) ?? 1;
                const wallsPayload = buildSimple2BhkWalls(levelId);

                emitAgentProgress(
                  controller,
                  encoder,
                  toAgentEvent({
                    kind: "tool",
                    stage: "executing",
                    message: `Step 3/3: Creating 2BHK walls on level ${levelId}`,
                    toolName: "create_wall",
                    details: summarizeForDetails(wallsPayload, 900),
                  })
                );
                emitContentChunk(controller, encoder, "Now creating walls in your Revit model in realtime...\n\n");

                const wallsJob = await enqueueCommandForUser(userId, "create_wall", wallsPayload);
                const wallsResult = await waitForCommandResult(wallsJob.id);
                if (!wallsResult.success) {
                  throw new Error(`Wall creation failed: ${wallsResult.error}`);
                }

                emitAgentProgress(
                  controller,
                  encoder,
                  toAgentEvent({
                    kind: "tool",
                    stage: "completed",
                    message: "Continuous 2BHK workflow completed",
                    toolName: "create_wall",
                    details: summarizeForDetails(wallsResult.result),
                  })
                );

                finalResponse =
                  "Completed continuous 2BHK base build in Revit (analysis + levels + walls). Next, I can continue automatically with doors/windows/room naming.";
                emitContentChunk(controller, encoder, finalResponse);
              } else {
                finalResponse =
                  "Revit Agent is disconnected. I cannot continue the agent workflow until plugin + local agent are connected.";
                emitAgentProgress(
                  controller,
                  encoder,
                  toAgentEvent({
                    kind: "analysis",
                    stage: "error",
                    message: "Realtime workflow blocked: Revit Agent disconnected",
                    toolName: "layout_analysis",
                  })
                );
                emitContentChunk(controller, encoder, finalResponse);
              }

              await prisma.chatMessage.create({
                data: {
                  conversationId: conversation.id,
                  role: "assistant",
                  content: finalResponse,
                },
              });

              controller.enqueue(encoder.encode(createSseData({ conversationId: conversation.id })));
              controller.enqueue(encoder.encode("data: [DONE]\n\n"));
              controller.close();
            } catch (error) {
              const errorMessage = error instanceof Error ? error.message : "Continuous workflow failed";
              emitAgentProgress(
                controller,
                encoder,
                toAgentEvent({
                  kind: "tool",
                  stage: "error",
                  message: errorMessage,
                  toolName: toolName,
                })
              );
              finalResponse = `Workflow stopped: ${errorMessage}`;
              emitContentChunk(controller, encoder, finalResponse);
              await prisma.chatMessage.create({
                data: {
                  conversationId: conversation.id,
                  role: "assistant",
                  content: finalResponse,
                },
              });
              controller.enqueue(encoder.encode(createSseData({ conversationId: conversation.id })));
              controller.enqueue(encoder.encode("data: [DONE]\n\n"));
              controller.close();
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
    let mcpCatalogAvailable = false;
    let mcpTools: Array<{ name: string; description: string }> = [];
    let mcpToolCount = 0;
    let mcpReason = "";
    if (enableMCP) {
      try {
        const mcpClient = getMCPClient();
        const isHealthy = await mcpClient.testConnection();
        mcpConnected = isHealthy;

        try {
          mcpTools = await mcpClient.listTools();
          mcpToolCount = mcpTools.length;
          mcpCatalogAvailable = true;
        } catch (toolsError) {
          mcpCatalogAvailable = false;
          mcpReason = toolsError instanceof Error ? toolsError.message : "MCP tools list failed";
          if (!mcpConnected && mcpReason.includes("MCP RPC failed (tools/list):")) {
            mcpConnected = true;
          }
        }

        if (mcpCatalogAvailable) {
    const toolsList = mcpTools.slice(0, 50).map((t) => `- ${t.name}: ${t.description}`).join("\n");
          mcpSystemMessage = `\n\nMCP_CONNECTION_STATUS=${mcpConnected ? "CONNECTED" : "DISCONNECTED"}\nMCP_CATALOG_STATUS=AVAILABLE\nMCP_TOOL_COUNT=${mcpToolCount}\nREVIT_AGENT_STATUS=${revitConnected ? "CONNECTED" : "DISCONNECTED"}\n\nYou have access to ${mcpToolCount} Revit MCP tools for BIM automation and architectural design:\n\n${toolsList}\n\nWhen users ask for Revit-related tasks:
- If REVIT_AGENT_STATUS=CONNECTED, you can state that execution from Copilot is available.
- If REVIT_AGENT_STATUS=DISCONNECTED, instruct user to connect Datum Revit Agent and keep Revit open.
Do not claim MCP is disconnected when MCP_CONNECTION_STATUS=CONNECTED.
For executable Revit tasks, prefer giving one concrete next command in this format:
/run <tool_name> <json_args>
Avoid returning large raw JSON payloads unless user explicitly asks for JSON.`;
        } else {
          mcpSystemMessage = `\n\nMCP_CONNECTION_STATUS=${mcpConnected ? "CONNECTED" : "DISCONNECTED"}\nMCP_CATALOG_STATUS=UNAVAILABLE\nMCP_TOOL_COUNT=0\nREVIT_AGENT_STATUS=${revitConnected ? "CONNECTED" : "DISCONNECTED"}\nNote: MCP tool catalog is currently unavailable, but direct /run execution may still work via connected Revit Agent.`;
        }
      } catch (error) {
        console.error("Failed to load MCP tools:", error);
        mcpReason = error instanceof Error ? error.message : "Unknown MCP error";
        mcpSystemMessage = `\n\nMCP_CONNECTION_STATUS=DISCONNECTED\nMCP_CATALOG_STATUS=UNAVAILABLE\nMCP_TOOL_COUNT=0\nREVIT_AGENT_STATUS=${revitConnected ? "CONNECTED" : "DISCONNECTED"}\nNote: MCP tools connection is currently unavailable.`;
      }
    }

    if (isStatusIntent(userText)) {
      const mcpServerText = mcpConnected ? "Connected" : "Disconnected";
      const mcpCatalogText = mcpCatalogAvailable ? `Available (${mcpToolCount} tools)` : "Unavailable";
      const revitAgentText = revitConnected ? "Connected" : "Disconnected";
      const directRunText = revitConnected ? "Available" : "Unavailable";
      const deviceSuffix = recentAgentSession?.deviceName ? ` (${recentAgentSession.deviceName})` : "";
      const mcpReasonLine = mcpReason ? `\n- MCP Reason: ${mcpReason}` : "";

      const statusText = `Connection Status\n- MCP Server: ${mcpServerText}\n- MCP Catalog: ${mcpCatalogText}\n- Revit Agent: ${revitAgentText}${deviceSuffix}\n- Direct /run Execution: ${directRunText}${mcpReasonLine}\n\nTo execute a tool now, use:\n/run <tool_name> <json_args>\nExample: /run get_levels_list {}`;

      await prisma.chatMessage.create({
        data: {
          conversationId: conversation.id,
          role: "assistant",
          content: statusText,
        },
      });

      return buildImmediateSseResponse(statusText, conversation.id);
    }

    const availableToolNames = new Set(mcpTools.map((tool) => tool.name));
    const canRun2BhkWorkflow =
      revitConnected &&
      is2BhkBuildIntent(userText);

    if (canRun2BhkWorkflow) {
      const encoder = new TextEncoder();
      let finalResponse = "";

      const readableStream = new ReadableStream({
        async start(controller) {
          try {
            if (revitConnected) {
              emitAgentProgress(
                controller,
                encoder,
                toAgentEvent({
                  kind: "analysis",
                  stage: "planning",
                  message: "Analyzing current Revit plan before generating 2BHK layout",
                })
              );
              emitContentChunk(
                controller,
                encoder,
                "Analyzing your current plan and preparing the 2BHK layout strategy...\n\n"
              );

              const analysisJob = await enqueueCommandForUser(userId, "layout_analysis", {
                includeStructural: true,
                includeArchitectural: true,
                includeMEP: false,
                includeAnnotations: false,
                checkCodeCompliance: true,
              });
              const analysisResult = await waitForCommandResult(analysisJob.id);

              if (!analysisResult.success) {
                throw new Error(`Plan analysis failed: ${analysisResult.error}`);
              }

              emitAgentProgress(
                controller,
                encoder,
                toAgentEvent({
                  kind: "analysis",
                  stage: "completed",
                  message: "Current plan analysis completed",
                  details: summarizeForDetails(analysisResult.result, 900),
                })
              );
              emitContentChunk(
                controller,
                encoder,
                "Plan analysis complete. Selecting level and starting wall creation in realtime...\n\n"
              );

              const levelsJob = await enqueueCommandForUser(userId, "get_levels_list", {});
              const levelsResult = await waitForCommandResult(levelsJob.id);
              if (!levelsResult.success) {
                throw new Error(`Failed to fetch levels: ${levelsResult.error}`);
              }

              const levelId = extractFirstLevelId(levelsResult.result) ?? 1;
              const wallPayload = buildSimple2BhkWalls(levelId);

              emitAgentProgress(
                controller,
                encoder,
                toAgentEvent({
                  kind: "tool",
                  stage: "executing",
                  message: `Creating 2BHK wall layout on level ${levelId}`,
                  toolName: "create_wall",
                  details: summarizeForDetails(wallPayload, 900),
                })
              );
              emitContentChunk(
                controller,
                encoder,
                "Now creating the 2BHK walls in your model. You should see updates in Revit as this step completes...\n\n"
              );

              const wallsJob = await enqueueCommandForUser(userId, "create_wall", wallPayload);
              const wallsResult = await waitForCommandResult(wallsJob.id);

              if (!wallsResult.success) {
                throw new Error(`Wall creation failed: ${wallsResult.error}`);
              }

              emitAgentProgress(
                controller,
                encoder,
                toAgentEvent({
                  kind: "tool",
                  stage: "completed",
                  message: "2BHK wall layout created successfully",
                  toolName: "create_wall",
                  details: summarizeForDetails(wallsResult.result),
                })
              );

              finalResponse =
                "2BHK base layout has been created in your Revit model (analysis + wall generation completed). Next I can continue step-by-step with doors, windows, and room placement in the same realtime flow.";
              emitContentChunk(controller, encoder, finalResponse);
            } else {
              finalResponse =
                "Revit Agent is disconnected, so I cannot build in realtime yet. Reconnect the agent and retry this same request.";
              emitAgentProgress(
                controller,
                encoder,
                toAgentEvent({
                  kind: "analysis",
                  stage: "error",
                  message: "Revit Agent is disconnected",
                  details: "Realtime creation requires active local agent and open Revit session.",
                })
              );
              emitContentChunk(controller, encoder, finalResponse);
            }

            await prisma.chatMessage.create({
              data: {
                conversationId: conversation.id,
                role: "assistant",
                content: finalResponse,
              },
            });

            controller.enqueue(encoder.encode(createSseData({ conversationId: conversation.id })));
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            controller.close();
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "2BHK workflow failed";
            emitAgentProgress(
              controller,
              encoder,
              toAgentEvent({
                kind: "tool",
                stage: "error",
                message: errorMessage,
                details: "Check Revit agent connection and model permissions, then retry.",
              })
            );
            finalResponse = `I could not complete the realtime 2BHK build: ${errorMessage}`;
            emitContentChunk(controller, encoder, finalResponse);
            await prisma.chatMessage.create({
              data: {
                conversationId: conversation.id,
                role: "assistant",
                content: finalResponse,
              },
            });
            controller.enqueue(encoder.encode(createSseData({ conversationId: conversation.id })));
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            controller.close();
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
    }

    const autoToolCall =
      enableMCP && mcpCatalogAvailable ? resolveAutoToolCall(userText, availableToolNames) : null;

    if (autoToolCall) {
      const encoder = new TextEncoder();
      let finalResponse = "";

      const readableStream = new ReadableStream({
        async start(controller) {
          try {
            emitAgentProgress(
              controller,
              encoder,
              toAgentEvent({
                kind: "analysis",
                stage: "planning",
                message: `Planning execution for ${autoToolCall.toolName}`,
                toolName: autoToolCall.toolName,
                details: summarizeForDetails(autoToolCall.args, 700),
              })
            );

            if (revitConnected) {
              emitAgentProgress(
                controller,
                encoder,
                toAgentEvent({
                  kind: "tool",
                  stage: "executing",
                  message: `Running ${autoToolCall.toolName} in your active Revit session`,
                  toolName: autoToolCall.toolName,
                  details: summarizeForDetails(autoToolCall.args, 900),
                })
              );

              const job = await enqueueCommandForUser(userId, autoToolCall.toolName, autoToolCall.args);
              const result = await waitForCommandResult(job.id);

              if (result.success) {
                finalResponse = `Executed ${autoToolCall.toolName} successfully in Revit.\n\nResult:\n${JSON.stringify(result.result, null, 2)}`;
                emitAgentProgress(
                  controller,
                  encoder,
                  toAgentEvent({
                    kind: "tool",
                    stage: "completed",
                    message: `${autoToolCall.toolName} completed successfully`,
                    toolName: autoToolCall.toolName,
                    details: summarizeForDetails(result.result),
                  })
                );
              } else {
                finalResponse = `Execution failed for ${autoToolCall.toolName}: ${result.error}`;
                emitAgentProgress(
                  controller,
                  encoder,
                  toAgentEvent({
                    kind: "tool",
                    stage: "error",
                    message: result.error,
                    toolName: autoToolCall.toolName,
                    details: summarizeForDetails({ error: result.error }),
                  })
                );
              }

              controller.enqueue(encoder.encode(createSseData({ content: finalResponse })));
            } else {
              finalResponse =
                "I found an executable Revit action, but Revit Agent is disconnected. Connect Datum Revit Agent and keep Revit open, then retry.";
              emitAgentProgress(
                controller,
                encoder,
                toAgentEvent({
                  kind: "analysis",
                  stage: "error",
                  message: "Revit Agent is disconnected",
                  toolName: autoToolCall.toolName,
                  details: "Execution is blocked until local Datum Revit Agent reconnects.",
                })
              );
              controller.enqueue(encoder.encode(createSseData({ content: finalResponse })));
            }

            await prisma.chatMessage.create({
              data: {
                conversationId: conversation.id,
                role: "assistant",
                content: finalResponse,
              },
            });

            controller.enqueue(encoder.encode(createSseData({ conversationId: conversation.id })));
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            controller.close();
          } catch (error) {
            console.error("Agentic execution error:", error);
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
