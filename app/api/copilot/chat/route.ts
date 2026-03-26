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
type AgentEventKind = "analysis" | "tool" | "plan";

type AgentTodoStepStatus = "pending" | "in_progress" | "completed" | "failed" | "blocked";

interface AgentTodoStep {
  id: string;
  title: string;
  toolName?: string;
  status: AgentTodoStepStatus;
  reason?: string;
}

interface AgentProgressEvent {
  stage: AgentStage;
  message: string;
  toolName?: string;
  kind: AgentEventKind;
  details?: string;
  plan?: AgentTodoStep[];
  timestamp: string;
}

interface AgentToolCall {
  toolName: string;
  args: Record<string, unknown>;
}

function resolveToolAlias(toolName: string): string {
  const normalized = toolName.trim().toLowerCase();
  const aliases: Record<string, string> = {
    layout_analysis: "analyze_layout_design",
    analyse_layout_design: "analyze_layout_design",
    analyze_layout: "analyze_layout_design",
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

    const baseLevelIdRaw = typedWall.baseLevelId ?? typedWall.levelId;
    let baseLevelId: number | undefined;
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
      isStructural: typeof typedWall.isStructural === "boolean" ? typedWall.isStructural : false,
      wallTypeName: typeof typedWall.wallTypeName === "string" ? typedWall.wallTypeName : undefined,
    };
  });

  return {
    ...args,
    walls: normalizedWalls,
  };
}

function hasMissingBaseLevelId(args: Record<string, unknown>): boolean {
  const walls = args.walls;
  if (!Array.isArray(walls)) return false;

  return walls.some((wall) => {
    if (!wall || typeof wall !== "object") return false;
    const typedWall = wall as Record<string, unknown>;
    return typeof typedWall.baseLevelId !== "number";
  });
}

function applyBaseLevelIdToWalls(
  args: Record<string, unknown>,
  baseLevelId: number
): Record<string, unknown> {
  const walls = args.walls;
  if (!Array.isArray(walls)) return args;

  return {
    ...args,
    walls: walls.map((wall) => {
      if (!wall || typeof wall !== "object") return wall;
      const typedWall = wall as Record<string, unknown>;
      if (typeof typedWall.baseLevelId === "number") return wall;
      return { ...typedWall, baseLevelId };
    }),
  };
}

async function resolveDefaultLevelIdForUser(clerkUserId: string): Promise<number | null> {
  const levelsResult = await executeRevitToolForUser(clerkUserId, "get_levels_list", {});
  if (!levelsResult.success) {
    return null;
  }
  return extractFirstLevelId(levelsResult.result);
}

async function executeRevitToolForUser(
  clerkUserId: string,
  toolName: string,
  args: Record<string, unknown>,
  options?: { preferMcp?: boolean; allowLegacyFallback?: boolean }
): Promise<{ success: true; result: unknown; transport: "mcp" | "legacy" } | { success: false; error: string; transport: "mcp" | "legacy" }> {
  const preferMcp = options?.preferMcp ?? true;
  const allowLegacyFallback = options?.allowLegacyFallback ?? true;

  if (preferMcp) {
    try {
      const mcpClient = getMCPClient();
      const mcpResult = await mcpClient.callTool(toolName, args);
      const toolError = mcpResult.success ? getToolExecutionError(mcpResult.result) : null;

      if (mcpResult.success && !toolError) {
        return { success: true, result: mcpResult.result, transport: "mcp" };
      }

      const mcpError = toolError || mcpResult.error || `MCP tool call failed for ${toolName}`;
      if (!allowLegacyFallback) {
        return { success: false, error: mcpError, transport: "mcp" };
      }
    } catch (error) {
      if (!allowLegacyFallback) {
        return {
          success: false,
          error: error instanceof Error ? error.message : `MCP tool call failed for ${toolName}`,
          transport: "mcp",
        };
      }
    }
  }

  const job = await enqueueCommandForUser(clerkUserId, toolName, args);
  const result = await waitForCommandResult(job.id);
  if (result.success) {
    return { success: true, result: result.result, transport: "legacy" };
  }

  return { success: false, error: result.error, transport: "legacy" };
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

function isSimpleTwoRoomHouseIntent(input: string): boolean {
  const text = input.toLowerCase();
  const hasBuildVerb = containsAny(text, ["create", "build", "make", "start", "design"]);
  const hasHouseContext = containsAny(text, ["house", "home", "layout", "plan", "rooms"]);
  const hasTwoRoomHint = containsAny(text, ["2 room", "2 rooms", "two room", "two rooms", "2 bedroom", "two bedroom"]);

  return hasBuildVerb && hasHouseContext && hasTwoRoomHint;
}

function isRevitExecutionBuildIntent(input: string): boolean {
  const text = input.toLowerCase();
  const hasBuildVerb = containsAny(text, ["create", "build", "make", "start", "implement"]);
  const hasBimObject = containsAny(text, [
    "house",
    "room",
    "rooms",
    "wall",
    "walls",
    "door",
    "window",
    "furniture",
    "floor",
    "roof",
    "revit",
  ]);

  return hasBuildVerb && hasBimObject;
}

function requiresBuildClarification(input: string): boolean {
  const text = input.toLowerCase();
  const buildLike = containsAny(text, ["create", "build", "make", "design", "generate"]);
  const modelLike = containsAny(text, ["house", "home", "layout", "plan", "revit", "building"]);

  if (!buildLike || !modelLike) {
    return false;
  }

  const hasScope = containsAny(text, [
    "1bhk",
    "2bhk",
    "3bhk",
    "bedroom",
    "rooms",
    "room",
    "sqft",
    "sqm",
    "meter",
    "m2",
    "x",
    "by",
  ]);

  return !hasScope;
}

function isContinuationIntent(input: string): boolean {
  const text = input.toLowerCase().trim();
  return containsAny(text, ["ok", "continue", "go ahead", "proceed", "yes", "next"]);
}

function has2BhkIntentInContext(messages: Array<{ role: string; content: unknown }>): boolean {
  const joined = messages
    .map((message) => (typeof message.content === "string" ? message.content : ""))
    .join("\n")
    .toLowerCase();

  return containsAny(joined, ["2bhk", "2 bhk", "two bedroom", "flat layout", "simple 2bhk"]);
}

function hasBuildIntentInContext(messages: Array<{ role: string; content: unknown }>): boolean {
  const joined = messages
    .map((message) => (typeof message.content === "string" ? message.content : ""))
    .join("\n")
    .toLowerCase();

  const hasBuildVerb = containsAny(joined, ["create", "build", "make", "design", "construct", "generate", "add", "model"]);
  const hasRevitObject = containsAny(joined, [
    "bhk",
    "bedroom",
    "house",
    "flat",
    "layout",
    "plan",
    "wall",
    "room",
    "floor",
    "kitchen",
    "bathroom",
    "living",
  ]);

  return hasBuildVerb && hasRevitObject;
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

function buildSimple2BhkFloor(levelId: number) {
  return {
    floors: [
      {
        levelId,
        boundary: [
          { x: 0, y: 0 },
          { x: 14000, y: 0 },
          { x: 14000, y: 12000 },
          { x: 0, y: 12000 },
        ],
      },
    ],
  };
}

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
          {
            role: "user",
            content: userMessage,
          },
        ],
        maxTokens: 50,
        temperature: 0.3,
      },
    });

    const title = response.choices?.[0]?.message?.content?.trim();
    if (title && title.length > 0) {
      // Limit to 50 characters
      return title.length > 50 ? title.substring(0, 47) + "..." : title;
    }
    
    // Fallback to first message substring
    return userMessage.substring(0, 50);
  } catch (error) {
    console.error("Failed to generate title:", error);
    // Fallback to first message substring
    return userMessage.substring(0, 50);
  }
}

function buildSimple2BhkRooms(levelId: number) {
  return {
    rooms: [
      { levelId, location: { x: 2500, y: 2000 }, name: "Living", number: "101" },
      { levelId, location: { x: 2500, y: 6000 }, name: "Bedroom 1", number: "102" },
      { levelId, location: { x: 10000, y: 2500 }, name: "Kitchen", number: "103" },
      { levelId, location: { x: 10000, y: 7000 }, name: "Bedroom 2", number: "104" },
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

function buildTodoPlanFromToolCalls(
  calls: Array<{ toolName: string; args: Record<string, unknown> }>
): AgentTodoStep[] {
  return calls.map((call, index) => ({
    id: `step-${index + 1}`,
    title: `Run ${call.toolName}`,
    toolName: call.toolName,
    status: "pending",
  }));
}

function cloneTodoPlan(plan: AgentTodoStep[]): AgentTodoStep[] {
  return plan.map((step) => ({ ...step }));
}

function updateTodoPlanStep(
  plan: AgentTodoStep[],
  stepId: string,
  updates: Partial<AgentTodoStep>
): AgentTodoStep[] {
  return plan.map((step) => (step.id === stepId ? { ...step, ...updates } : step));
}

function formatToolOutcomeSummary(
  outcomes: Array<{ toolName: string; status: "success" | "failed"; reason?: string }>
): string {
  if (outcomes.length === 0) {
    return "No tools were executed.";
  }

  const success = outcomes.filter((item) => item.status === "success");
  const failed = outcomes.filter((item) => item.status === "failed");

  const successLine =
    success.length > 0
      ? `Working tools: ${success.map((item) => item.toolName).join(", ")}`
      : "Working tools: none";

  const failedLine =
    failed.length > 0
      ? `Failed tools: ${failed.map((item) => `${item.toolName} (${item.reason || "unknown reason"})`).join("; ")}`
      : "Failed tools: none";

  return `${successLine}\n${failedLine}`;
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

function getToolExecutionError(result: unknown): string | null {
  if (!result || typeof result !== "object") return null;
  const typed = result as Record<string, unknown>;

  if (typed.success === false && typeof typed.error === "string") {
    return typed.error;
  }

  if (typed.Success === false && typeof typed.Message === "string") {
    return typed.Message;
  }

  return null;
}

function getAnalysisCounts(result: unknown): { walls: number; floors: number; rooms: number } {
  if (!result || typeof result !== "object") {
    return { walls: 0, floors: 0, rooms: 0 };
  }

  const typed = result as Record<string, unknown>;
  const response = (typed.Response || typed.response || {}) as Record<string, unknown>;

  const wallCount =
    (response.walls && typeof (response.walls as Record<string, unknown>).count === "number"
      ? ((response.walls as Record<string, unknown>).count as number)
      : 0) || 0;

  const roomCount =
    (response.rooms && typeof (response.rooms as Record<string, unknown>).count === "number"
      ? ((response.rooms as Record<string, unknown>).count as number)
      : 0) || 0;

  const floorCount =
    (response.floors && typeof (response.floors as Record<string, unknown>).count === "number"
      ? ((response.floors as Record<string, unknown>).count as number)
      : 0) || 0;

  return {
    walls: wallCount,
    floors: floorCount,
    rooms: roomCount,
  };
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
    availableToolNames.has("analyze_layout_design")
  ) {
    return { toolName: "analyze_layout_design", args: parsedJson };
  }

  if (
    containsAny(text, ["analyse", "analyze", "scan", "review plan", "check plan"]) &&
    availableToolNames.has("analyze_layout_design")
  ) {
    return {
      toolName: "analyze_layout_design",
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

// ============================================================================
// LLM-DRIVEN AGENTIC ORCHESTRATION
// ============================================================================

interface AgenticPlanStep {
  toolName: string;
  args: Record<string, unknown>;
  description: string;
}

interface AgenticPlan {
  analysis: string;
  steps: AgenticPlanStep[];
  needsMoreInfo: boolean;
  clarificationQuestion?: string;
}

function normalizeAgenticSteps(
  steps: AgenticPlanStep[] | null | undefined,
  availableToolNames: Set<string>
): AgenticPlanStep[] {
  if (!Array.isArray(steps)) return [];

  return steps.filter((step) => {
    if (!step || typeof step !== "object") return false;
    if (!step.toolName || typeof step.toolName !== "string") return false;

    const resolvedName = resolveToolAlias(step.toolName);
    if (availableToolNames.has(resolvedName) || availableToolNames.has(step.toolName)) {
      step.toolName = availableToolNames.has(step.toolName) ? step.toolName : resolvedName;
      if (!step.args || typeof step.args !== "object" || Array.isArray(step.args)) {
        step.args = {};
      }
      if (!step.description || typeof step.description !== "string") {
        step.description = `Run ${step.toolName}`;
      }
      return true;
    }

    console.warn(`Agentic planning: Skipping unavailable tool "${step.toolName}"`);
    return false;
  });
}

const AGENTIC_PLANNING_PROMPT = `You are an expert BIM/Revit automation planner. Analyze the user's request and create a concrete execution plan using the available tools.

CRITICAL: You MUST create an executable plan. Do NOT ask for more information unless absolutely necessary for safety/correctness. Make reasonable assumptions when details are missing (e.g., use default level if not specified, use standard dimensions if not provided).

AVAILABLE TOOLS:
{TOOLS_LIST}

USER'S REQUEST:
{USER_REQUEST}

PREVIOUS CONTEXT (if any):
{CONTEXT}

INSTRUCTIONS:
1. Analyze what the user wants to accomplish
2. ONLY set needsMoreInfo=true if the request is completely vague or could cause serious errors without clarification
3. Otherwise, create a step-by-step plan using ONLY the available tools listed above
4. Make reasonable assumptions:
   - If no level specified, plan to call get_levels_list first to get a valid level
   - If dimensions not specified, use reasonable defaults (e.g., 3000mm wall height, 10000mm x 8000mm room)
   - If object type not specified, use generic/default types
5. Each step must have exact toolName (from the list), args (valid JSON), and description
6. For building tasks, ALWAYS start with get_levels_list to get valid level IDs
7. Use the tool names EXACTLY as listed - do not invent tools

Respond with ONLY valid JSON in this format:
{
  "analysis": "Brief analysis of what user wants",
  "needsMoreInfo": false,
  "clarificationQuestion": null,
  "steps": [
    {
      "toolName": "exact_tool_name",
      "args": { "param": "value" },
      "description": "What this step accomplishes"
    }
  ]
}

ONLY use this format if request is dangerously vague:
{
  "analysis": "Analysis of why clarification is critical",
  "needsMoreInfo": true,
  "clarificationQuestion": "What specific critical information do you need?",
  "steps": []
}

Remember: Prefer execution over clarification. Make reasonable assumptions.`;

const AGENTIC_CONTINUATION_PROMPT = `You are a BIM/Revit automation executor. Based on the previous step's result, determine the next action.

CRITICAL: You are an AGENT, not a chatbot. Your job is to COMPLETE the goal, not to stop and report. ONLY stop if:
1. The goal is 100% achieved
2. An unrecoverable error occurred
3. You need different tools that aren't available

Otherwise, you MUST continue execution.

AVAILABLE TOOLS:
{TOOLS_LIST}

ORIGINAL GOAL:
{ORIGINAL_GOAL}

COMPLETED STEPS:
{COMPLETED_STEPS}

LAST STEP RESULT:
{LAST_RESULT}

REMAINING PLANNED STEPS:
{REMAINING_STEPS}

INSTRUCTIONS:
1. Analyze the last result - was it successful?
2. If successful and there are remaining steps, action MUST be "continue"
3. If successful but you need to adjust the plan based on results, use "add_steps" or modify nextStep args
4. ONLY use "goal_achieved" if the ORIGINAL GOAL is 100% complete (not just one step)
5. ONLY use "error_stop" if there's an unrecoverable error

BIAS TOWARD CONTINUATION. You are an autonomous agent - keep working until the job is done.

Respond with ONLY valid JSON:
{
  "action": "continue" | "add_steps" | "goal_achieved" | "error_stop",
  "reasoning": "Why this action",
  "nextStep": { "toolName": "...", "args": {...}, "description": "..." } | null,
  "additionalSteps": [...] | null,
  "finalSummary": "Summary if goal_achieved or error_stop" | null
}`;

async function generateAgenticPlan(
  userRequest: string,
  toolsList: string,
  context: string,
  availableToolNames: Set<string>
): Promise<AgenticPlan> {
  const prompt = AGENTIC_PLANNING_PROMPT
    .replace("{TOOLS_LIST}", toolsList)
    .replace("{USER_REQUEST}", userRequest)
    .replace("{CONTEXT}", context || "None");

  try {
    const response = await openrouter.chat.send({
      chatGenerationParams: {
        model: "anthropic/claude-sonnet-4",
        messages: [
          { role: "user", content: prompt }
        ],
        maxTokens: 2000,
        temperature: 0.1,
      },
    });

    const content = response.choices?.[0]?.message?.content || "";
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error("Agentic planning: No JSON found in response", content);
      return { analysis: "Failed to parse plan", steps: [], needsMoreInfo: true, clarificationQuestion: "Could you please rephrase your request?" };
    }

    const parsed = JSON.parse(jsonMatch[0]) as AgenticPlan;
    
    // Validate and filter steps to only include available tools
    parsed.steps = normalizeAgenticSteps(parsed.steps, availableToolNames);
    
    return parsed;
  } catch (error) {
    console.error("Agentic planning error:", error);
    return { analysis: "Planning failed", steps: [], needsMoreInfo: true, clarificationQuestion: "An error occurred while planning. Please try again." };
  }
}

interface AgenticContinuation {
  action: "continue" | "add_steps" | "goal_achieved" | "error_stop";
  reasoning: string;
  nextStep: AgenticPlanStep | null;
  additionalSteps: AgenticPlanStep[] | null;
  finalSummary: string | null;
}

async function determineNextAgenticAction(
  originalGoal: string,
  completedSteps: Array<{ step: AgenticPlanStep; result: unknown }>,
  lastResult: unknown,
  remainingSteps: AgenticPlanStep[],
  toolsList: string
): Promise<AgenticContinuation> {
  const completedSummary = completedSteps.map((s, i) => 
    `Step ${i + 1}: ${s.step.toolName} - ${s.step.description}\nResult: ${JSON.stringify(s.result).slice(0, 500)}`
  ).join("\n\n");

  const remainingSummary = remainingSteps.map((s, i) =>
    `Step ${i + 1}: ${s.toolName} - ${s.description}`
  ).join("\n");

  const prompt = AGENTIC_CONTINUATION_PROMPT
    .replace("{TOOLS_LIST}", toolsList)
    .replace("{ORIGINAL_GOAL}", originalGoal)
    .replace("{COMPLETED_STEPS}", completedSummary || "None")
    .replace("{LAST_RESULT}", JSON.stringify(lastResult).slice(0, 1000))
    .replace("{REMAINING_STEPS}", remainingSummary || "None");

  try {
    const response = await openrouter.chat.send({
      chatGenerationParams: {
        model: "anthropic/claude-sonnet-4",
        messages: [
          { role: "user", content: prompt }
        ],
        maxTokens: 1500,
        temperature: 0.1,
      },
    });

    const content = response.choices?.[0]?.message?.content || "";
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return { action: "error_stop", reasoning: "Failed to parse continuation", nextStep: null, additionalSteps: null, finalSummary: "Could not determine next action" };
    }

    const parsed = JSON.parse(jsonMatch[0]) as AgenticContinuation;
    return parsed;
  } catch (error) {
    console.error("Agentic continuation error:", error);
    return { action: "error_stop", reasoning: "Continuation failed", nextStep: null, additionalSteps: null, finalSummary: "An error occurred during execution" };
  }
}

function requiresAgenticMode(userText: string): boolean {
  const text = userText.toLowerCase();
  
  // ANY build/create/make request with Revit objects should be agentic
  const hasBuildVerb = containsAny(text, ["create", "build", "make", "design", "construct", "generate", "add", "draw", "model", "place"]);
  const hasRevitObject = containsAny(text, [
    "wall", "walls", "door", "doors", "window", "windows", "room", "rooms",
    "floor", "floors", "ceiling", "roof", "column", "columns", "beam", "beams",
    "house", "apartment", "flat", "layout", "floor plan", "plan", "building",
    "bhk", "bedroom", "kitchen", "bathroom", "living", "dining"
  ]);
  
  // Multi-step indicators
  const hasMultiStepIndicators = containsAny(text, [
    "step by step", "automatically", "end to end", "complete", "entire", "whole",
    "then", "after that", "followed by", "and also", "with"
  ]);
  
  // If user wants to build/create ANY Revit object, use agentic mode
  // This ensures ALL execution requests go through the agent, not just complex ones
  return (hasBuildVerb && hasRevitObject) || hasMultiStepIndicators;
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
      // Create new conversation with LLM-generated title based on first message
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
        if (hasMissingBaseLevelId(parsedArgs)) {
          const resolvedLevelId = await resolveDefaultLevelIdForUser(userId);
          if (resolvedLevelId) {
            parsedArgs = applyBaseLevelIdToWalls(parsedArgs, resolvedLevelId);
          }
        }
      }

      const continuous2BhkFromManual =
        toolName === "analyze_layout_design" &&
        (containsAny(userText.toLowerCase(), ["2bhk", "2 bhk", "two bedroom", "flat"]) ||
          has2BhkIntentInContext(messages));

      if (continuous2BhkFromManual) {
        const recentManualAgentSession = await prisma.revitAgentSession.findFirst({
          where: { clerkUserId: userId },
          orderBy: { lastSeenAt: "desc" },
        });
        const manualLegacyConnected =
          !!recentManualAgentSession &&
          Date.now() - new Date(recentManualAgentSession.lastSeenAt).getTime() <= 30_000;
        let manualMcpConnected = false;
        if (enableMCP) {
          try {
            manualMcpConnected = await getMCPClient().testConnection();
          } catch {
            manualMcpConnected = false;
          }
        }
        const manualRevitConnected = manualMcpConnected || manualLegacyConnected;

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
                  toolName: "analyze_layout_design",
                  details: "Flow: analyze → get levels → create walls",
                })
              );

              if (manualRevitConnected) {
                let todoPlan: AgentTodoStep[] = [
                  { id: "step-1", title: "Analyze current plan", toolName: "analyze_layout_design", status: "pending" },
                  { id: "step-2", title: "Get available levels", toolName: "get_levels_list", status: "pending" },
                  { id: "step-3", title: "Create 2BHK walls", toolName: "create_wall", status: "pending" },
                ];

                emitAgentProgress(
                  controller,
                  encoder,
                  toAgentEvent({
                    kind: "plan",
                    stage: "planning",
                    message: "Created execution plan for 2BHK workflow",
                    plan: cloneTodoPlan(todoPlan),
                  })
                );

                todoPlan = updateTodoPlanStep(todoPlan, "step-1", { status: "in_progress" });
                emitAgentProgress(
                  controller,
                  encoder,
                  toAgentEvent({
                    kind: "plan",
                    stage: "executing",
                    message: "Step 1/3: Analyzing current plan",
                    toolName: "analyze_layout_design",
                    plan: cloneTodoPlan(todoPlan),
                    details: summarizeForDetails(parsedArgs, 700),
                  })
                );
                emitContentChunk(controller, encoder, "Starting plan analysis in Revit...\n\n");

                const analysisResult = await executeRevitToolForUser(userId, "analyze_layout_design", parsedArgs);
                if (!analysisResult.success) {
                  throw new Error(`Plan analysis failed: ${analysisResult.error}`);
                }

                emitAgentProgress(
                  controller,
                  encoder,
                  toAgentEvent({
                    kind: "plan",
                    stage: "completed",
                    message: "Step 1/3 completed",
                    plan: cloneTodoPlan(updateTodoPlanStep(todoPlan, "step-1", { status: "completed" })),
                  })
                );
                todoPlan = updateTodoPlanStep(todoPlan, "step-1", { status: "completed" });

                todoPlan = updateTodoPlanStep(todoPlan, "step-2", { status: "in_progress" });
                emitAgentProgress(
                  controller,
                  encoder,
                  toAgentEvent({
                    kind: "plan",
                    stage: "executing",
                    message: "Step 2/3: Reading available levels",
                    plan: cloneTodoPlan(todoPlan),
                  })
                );

                emitAgentProgress(
                  controller,
                  encoder,
                  toAgentEvent({
                    kind: "analysis",
                    stage: "completed",
                    message: "Step 1/3 complete: plan analysis finished",
                    toolName: "analyze_layout_design",
                    details: summarizeForDetails(analysisResult.result, 900),
                  })
                );

                emitAgentProgress(
                  controller,
                  encoder,
                  toAgentEvent({
                    kind: "plan",
                    stage: "completed",
                    message: "Step 2/3 completed",
                    plan: cloneTodoPlan(updateTodoPlanStep(todoPlan, "step-2", { status: "completed" })),
                  })
                );
                todoPlan = updateTodoPlanStep(todoPlan, "step-2", { status: "completed" });
                emitContentChunk(controller, encoder, "Analysis complete. Fetching model levels and preparing wall placement...\n\n");

                const levelsResult = await executeRevitToolForUser(userId, "get_levels_list", {});
                if (!levelsResult.success) {
                  throw new Error(`Level query failed: ${levelsResult.error}`);
                }

                const levelId = extractFirstLevelId(levelsResult.result) ?? 1;
                const wallsPayload = buildSimple2BhkWalls(levelId);

                todoPlan = updateTodoPlanStep(todoPlan, "step-3", { status: "in_progress" });
                emitAgentProgress(
                  controller,
                  encoder,
                  toAgentEvent({
                    kind: "plan",
                    stage: "executing",
                    message: "Step 3/3: Creating 2BHK walls",
                    plan: cloneTodoPlan(todoPlan),
                  })
                );

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

                const wallsResult = await executeRevitToolForUser(userId, "create_wall", wallsPayload);
                if (!wallsResult.success) {
                  throw new Error(`Wall creation failed: ${wallsResult.error}`);
                }

                emitAgentProgress(
                  controller,
                  encoder,
                  toAgentEvent({
                    kind: "plan",
                    stage: "completed",
                    message: "Execution plan completed",
                    plan: cloneTodoPlan(updateTodoPlanStep(todoPlan, "step-3", { status: "completed" })),
                  })
                );
                todoPlan = updateTodoPlanStep(todoPlan, "step-3", { status: "completed" });

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
                const blockedPlan: AgentTodoStep[] = [
                  {
                    id: "step-1",
                    title: "Connect Cloud Relay / Revit Plugin",
                    status: "blocked",
                    reason: "No active execution transport",
                  },
                ];
                finalResponse =
                  "No active execution transport found. I cannot continue until Cloud Relay (or legacy local agent) is connected to your Revit plugin.";
                emitAgentProgress(
                  controller,
                  encoder,
                  toAgentEvent({
                    kind: "plan",
                    stage: "error",
                    message: "Execution blocked until connection is restored",
                    plan: blockedPlan,
                  })
                );
                emitAgentProgress(
                  controller,
                  encoder,
                  toAgentEvent({
                    kind: "analysis",
                    stage: "error",
                    message: "Realtime workflow blocked: no active execution transport",
                    toolName: "analyze_layout_design",
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

      const result = await executeRevitToolForUser(userId, toolName, parsedArgs, {
        preferMcp: true,
        allowLegacyFallback: true,
      });
      const resultText = result.success
        ? `Tool ${toolName} executed successfully via ${result.transport.toUpperCase()}:\n${JSON.stringify(result.result, null, 2)}`
        : `Tool ${toolName} failed via ${result.transport.toUpperCase()}: ${result.error}`;

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
    const legacyRevitConnected =
      !!recentAgentSession &&
      Date.now() - new Date(recentAgentSession.lastSeenAt).getTime() <= 30_000;

    // Get MCP tools information if enabled
    let mcpSystemMessage = "";
    let mcpConnected = false;
    let mcpCatalogAvailable = false;
    let mcpTools: Array<{ name: string; description: string }> = [];
    let mcpToolCount = 0;
    let mcpReason = "";
    let revitConnected = legacyRevitConnected;
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
          const toolNamesCsv = mcpTools.map((t) => t.name).join(", ");
          const toolsList = mcpTools.map((t) => `- ${t.name}: ${t.description}`).join("\n");
          mcpSystemMessage = `\n\nMCP_CONNECTION_STATUS=${mcpConnected ? "CONNECTED" : "DISCONNECTED"}\nMCP_CATALOG_STATUS=AVAILABLE\nMCP_TOOL_COUNT=${mcpToolCount}\nLEGACY_AGENT_HEARTBEAT=${legacyRevitConnected ? "CONNECTED" : "DISCONNECTED"}\nREVIT_EXECUTION_STATUS=${(mcpConnected || legacyRevitConnected) ? "CONNECTED" : "DISCONNECTED"}\nEXECUTION_TRANSPORT=PRIMARY_MCP_RELAY_WITH_LEGACY_JOB_FALLBACK\n\nYou have access to ${mcpToolCount} Revit MCP tools for BIM automation:\n\n${toolsList}\n\nExecution architecture (authoritative): Browser LLM -> Datum API -> MCP on Railway + Cloud Relay -> Revit plugin -> Revit model.
- Treat MCP_CONNECTION_STATUS=CONNECTED as live execution available, even if LEGACY_AGENT_HEARTBEAT=DISCONNECTED.
- Use exact tool names from this catalog only.
- For executable tasks, execute tools directly; do not ask user to reconnect local-only agent when MCP relay is connected.
- If execution fails, report exact failing tool and transport (MCP or fallback).
MCP_TOOL_NAMES=${toolNamesCsv}
For manual execution format:
/run <tool_name> <json_args>
Avoid returning large raw JSON payloads unless user explicitly asks for JSON.`;
        } else {
          mcpSystemMessage = `\n\nMCP_CONNECTION_STATUS=${mcpConnected ? "CONNECTED" : "DISCONNECTED"}\nMCP_CATALOG_STATUS=UNAVAILABLE\nMCP_TOOL_COUNT=0\nLEGACY_AGENT_HEARTBEAT=${legacyRevitConnected ? "CONNECTED" : "DISCONNECTED"}\nREVIT_EXECUTION_STATUS=${(mcpConnected || legacyRevitConnected) ? "CONNECTED" : "DISCONNECTED"}\nEXECUTION_TRANSPORT=PRIMARY_MCP_RELAY_WITH_LEGACY_JOB_FALLBACK\nNote: MCP tool catalog is currently unavailable.`;
        }
      } catch (error) {
        console.error("Failed to load MCP tools:", error);
        mcpReason = error instanceof Error ? error.message : "Unknown MCP error";
        mcpSystemMessage = `\n\nMCP_CONNECTION_STATUS=DISCONNECTED\nMCP_CATALOG_STATUS=UNAVAILABLE\nMCP_TOOL_COUNT=0\nLEGACY_AGENT_HEARTBEAT=${legacyRevitConnected ? "CONNECTED" : "DISCONNECTED"}\nREVIT_EXECUTION_STATUS=${legacyRevitConnected ? "CONNECTED" : "DISCONNECTED"}\nEXECUTION_TRANSPORT=PRIMARY_MCP_RELAY_WITH_LEGACY_JOB_FALLBACK\nNote: MCP tools connection is currently unavailable.`;
      }
    }

    revitConnected = mcpConnected || legacyRevitConnected;

    if (isStatusIntent(userText)) {
      const mcpServerText = mcpConnected ? "Connected" : "Disconnected";
      const mcpCatalogText = mcpCatalogAvailable ? `Available (${mcpToolCount} tools)` : "Unavailable";
      const revitAgentText = revitConnected ? "Connected" : "Disconnected";
      const directRunText = revitConnected ? "Available" : "Unavailable";
      const deviceSuffix = recentAgentSession?.deviceName ? ` (${recentAgentSession.deviceName})` : "";
      const mcpReasonLine = mcpReason ? `\n- MCP Reason: ${mcpReason}` : "";

      const statusText = `Connection Status\n- MCP Server: ${mcpServerText}\n- MCP Catalog: ${mcpCatalogText}\n- Cloud Relay + Plugin: ${mcpConnected ? "Connected" : "Unknown"}\n- Legacy Local Heartbeat: ${legacyRevitConnected ? "Connected" : "Disconnected"}${deviceSuffix}\n- Direct /run Execution: ${directRunText}${mcpReasonLine}\n\nTo execute a tool now, use:\n/run <tool_name> <json_args>\nExample: /run get_levels_list {}`;

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
    const isToolAvailable = (name: string) => !mcpCatalogAvailable || availableToolNames.has(name);
    const continue2BhkWorkflow = has2BhkIntentInContext(messages) && isContinuationIntent(userText);
    const continueBuildWorkflow = hasBuildIntentInContext(messages) && isContinuationIntent(userText);
    const isAgenticBuildRequest = requiresAgenticMode(userText) || continueBuildWorkflow;
    const isHouseWorkflowIntent =
      is2BhkBuildIntent(userText) ||
      isSimpleTwoRoomHouseIntent(userText) ||
      continue2BhkWorkflow;
    const canRun2BhkWorkflow = revitConnected && isHouseWorkflowIntent && !isAgenticBuildRequest;

    if (!revitConnected && isRevitExecutionBuildIntent(userText)) {
      const disconnectedExecutionText =
        "I can execute this in Revit, but no active execution transport is available right now. Reconnect Cloud Relay (or legacy local agent), keep Revit open, then retry.";

      await prisma.chatMessage.create({
        data: {
          conversationId: conversation.id,
          role: "assistant",
          content: disconnectedExecutionText,
        },
      });

      return buildImmediateSseResponse(disconnectedExecutionText, conversation.id);
    }

    if (requiresBuildClarification(userText)) {
      const clarifyText =
        "I can run this fully agentically, but I need one input before execution: target scope. Reply with one option: (1) 1BHK compact, (2) 2BHK standard, (3) 3BHK, or provide custom size (example: 14m x 12m, 2 bedrooms).";

      await prisma.chatMessage.create({
        data: {
          conversationId: conversation.id,
          role: "assistant",
          content: clarifyText,
        },
      });

      return buildImmediateSseResponse(clarifyText, conversation.id);
    }

    if (canRun2BhkWorkflow) {
      const encoder = new TextEncoder();
      let finalResponse = "";

      const readableStream = new ReadableStream({
        async start(controller) {
          try {
            if (revitConnected) {
              const canAnalyze = isToolAvailable("analyze_layout_design");
              const canCreateWalls = isToolAvailable("create_wall");
              const canCreateFloor = isToolAvailable("create_floor");
              const canCreateRoom = isToolAvailable("create_room");
              const canGetLevels = isToolAvailable("get_levels_list");
              const toolOutcomes: Array<{ toolName: string; status: "success" | "failed"; reason?: string }> = [];

              let todoPlan: AgentTodoStep[] = [
                { id: "step-1", title: "Analyze existing model", toolName: "analyze_layout_design", status: canAnalyze ? "pending" : "blocked", reason: canAnalyze ? undefined : "Tool unavailable in live MCP catalog" },
                { id: "step-2", title: "Read available levels", toolName: "get_levels_list", status: canGetLevels ? "pending" : "failed", reason: canGetLevels ? undefined : "Required tool missing" },
                { id: "step-3", title: "Create 2BHK walls", toolName: "create_wall", status: canCreateWalls ? "pending" : "failed", reason: canCreateWalls ? undefined : "Required tool missing" },
                { id: "step-4", title: "Create floor slab", toolName: "create_floor", status: canCreateFloor ? "pending" : "blocked", reason: canCreateFloor ? undefined : "Optional tool unavailable" },
                { id: "step-5", title: "Create room objects", toolName: "create_room", status: canCreateRoom ? "pending" : "blocked", reason: canCreateRoom ? undefined : "Optional tool unavailable" },
                { id: "step-6", title: "Verify final model state", toolName: "analyze_layout_design", status: canAnalyze ? "pending" : "blocked", reason: canAnalyze ? undefined : "Tool unavailable in live MCP catalog" },
              ];

              emitAgentProgress(
                controller,
                encoder,
                toAgentEvent({
                  kind: "plan",
                  stage: "planning",
                  message: "Created execution plan for end-to-end 2BHK automation",
                  plan: cloneTodoPlan(todoPlan),
                })
              );

              let beforeCounts = { walls: 0, floors: 0, rooms: 0 };
              let afterCounts = { walls: 0, floors: 0, rooms: 0 };

              if (!canCreateWalls || !canGetLevels) {
                toolOutcomes.push(
                  ...(!canGetLevels ? [{ toolName: "get_levels_list", status: "failed" as const, reason: "Required tool missing" }] : []),
                  ...(!canCreateWalls ? [{ toolName: "create_wall", status: "failed" as const, reason: "Required tool missing" }] : [])
                );
                finalResponse =
                  `Cannot start 2BHK execution because required tools are unavailable in current MCP catalog (need get_levels_list + create_wall).\n\n${formatToolOutcomeSummary(toolOutcomes)}`;
                emitAgentProgress(
                  controller,
                  encoder,
                  toAgentEvent({
                    kind: "plan",
                    stage: "error",
                    message: "Execution plan failed: required tools missing",
                    details: `Available required flags => get_levels_list:${canGetLevels}, create_wall:${canCreateWalls}`,
                    plan: cloneTodoPlan(todoPlan),
                  })
                );
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
                return;
              }

              if (canAnalyze) {
                todoPlan = updateTodoPlanStep(todoPlan, "step-1", { status: "in_progress" });
                emitAgentProgress(
                  controller,
                  encoder,
                  toAgentEvent({
                    kind: "plan",
                    stage: "executing",
                    message: "Step 1/6: analyzing current Revit model",
                    plan: cloneTodoPlan(todoPlan),
                  })
                );
                emitContentChunk(
                  controller,
                  encoder,
                  "Analyzing your current plan and preparing the 2BHK layout strategy...\n\n"
                );

                const analysisResult = await executeRevitToolForUser(userId, "analyze_layout_design", {
                  includeStructural: true,
                  includeArchitectural: true,
                  includeMEP: false,
                  includeAnnotations: false,
                  checkCodeCompliance: true,
                });
                const analysisToolError = analysisResult.success ? getToolExecutionError(analysisResult.result) : null;

                if (!analysisResult.success || analysisToolError) {
                  throw new Error(`Plan analysis failed: ${analysisToolError || (analysisResult.success ? "Unknown error" : analysisResult.error)}`);
                }
                toolOutcomes.push({ toolName: "analyze_layout_design", status: "success" });

                beforeCounts = getAnalysisCounts(analysisResult.result);
                todoPlan = updateTodoPlanStep(todoPlan, "step-1", { status: "completed" });

                emitAgentProgress(
                  controller,
                  encoder,
                  toAgentEvent({
                    kind: "plan",
                    stage: "completed",
                    message: "Step 1/6 completed",
                    plan: cloneTodoPlan(todoPlan),
                  })
                );
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
              } else {
                toolOutcomes.push({ toolName: "analyze_layout_design", status: "failed", reason: "Tool unavailable in live MCP catalog" });
              }

              todoPlan = updateTodoPlanStep(todoPlan, "step-2", { status: "in_progress" });
              emitAgentProgress(
                controller,
                encoder,
                toAgentEvent({
                  kind: "plan",
                  stage: "executing",
                  message: "Step 2/6: reading model levels",
                  plan: cloneTodoPlan(todoPlan),
                })
              );
              emitContentChunk(
                controller,
                encoder,
                "Plan analysis complete. Selecting level and starting wall creation in realtime...\n\n"
              );

              const levelsResult = await executeRevitToolForUser(userId, "get_levels_list", {});
              const levelsToolError = levelsResult.success ? getToolExecutionError(levelsResult.result) : null;
              if (!levelsResult.success || levelsToolError) {
                throw new Error(`Failed to fetch levels: ${levelsToolError || (levelsResult.success ? "Unknown error" : levelsResult.error)}`);
              }
              toolOutcomes.push({ toolName: "get_levels_list", status: "success" });
              todoPlan = updateTodoPlanStep(todoPlan, "step-2", { status: "completed" });
              emitAgentProgress(
                controller,
                encoder,
                toAgentEvent({
                  kind: "plan",
                  stage: "completed",
                  message: "Step 2/6 completed",
                  plan: cloneTodoPlan(todoPlan),
                })
              );

              const levelId = extractFirstLevelId(levelsResult.result) ?? 1;
              const wallPayload = buildSimple2BhkWalls(levelId);

              todoPlan = updateTodoPlanStep(todoPlan, "step-3", { status: "in_progress" });
              emitAgentProgress(
                controller,
                encoder,
                toAgentEvent({
                  kind: "plan",
                  stage: "executing",
                  message: "Step 3/6: creating 2BHK walls",
                  plan: cloneTodoPlan(todoPlan),
                })
              );

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

              const wallsResult = await executeRevitToolForUser(userId, "create_wall", wallPayload);
              const wallsToolError = wallsResult.success ? getToolExecutionError(wallsResult.result) : null;

              if (!wallsResult.success || wallsToolError) {
                throw new Error(`Wall creation failed: ${wallsToolError || (wallsResult.success ? "Unknown error" : wallsResult.error)}`);
              }
              toolOutcomes.push({ toolName: "create_wall", status: "success" });
              todoPlan = updateTodoPlanStep(todoPlan, "step-3", { status: "completed" });
              emitAgentProgress(
                controller,
                encoder,
                toAgentEvent({
                  kind: "plan",
                  stage: "completed",
                  message: "Step 3/6 completed",
                  plan: cloneTodoPlan(todoPlan),
                })
              );

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

              if (canCreateFloor) {
                todoPlan = updateTodoPlanStep(todoPlan, "step-4", { status: "in_progress" });
                emitAgentProgress(
                  controller,
                  encoder,
                  toAgentEvent({
                    kind: "plan",
                    stage: "executing",
                    message: "Step 4/6: creating floor slab",
                    plan: cloneTodoPlan(todoPlan),
                  })
                );
                const floorPayload = buildSimple2BhkFloor(levelId);
                emitAgentProgress(
                  controller,
                  encoder,
                  toAgentEvent({
                    kind: "tool",
                    stage: "executing",
                    message: "Creating base floor slab",
                    toolName: "create_floor",
                    details: summarizeForDetails(floorPayload, 900),
                  })
                );

                const floorResult = await executeRevitToolForUser(userId, "create_floor", floorPayload);
                const floorToolError = floorResult.success ? getToolExecutionError(floorResult.result) : null;
                if (floorResult.success && !floorToolError) {
                  toolOutcomes.push({ toolName: "create_floor", status: "success" });
                  todoPlan = updateTodoPlanStep(todoPlan, "step-4", { status: "completed" });
                  emitAgentProgress(
                    controller,
                    encoder,
                    toAgentEvent({
                      kind: "plan",
                      stage: "completed",
                      message: "Step 4/6 completed",
                      plan: cloneTodoPlan(todoPlan),
                    })
                  );
                  emitAgentProgress(
                    controller,
                    encoder,
                    toAgentEvent({
                      kind: "tool",
                      stage: "completed",
                      message: "Floor created successfully",
                      toolName: "create_floor",
                      details: summarizeForDetails(floorResult.result),
                    })
                  );
                } else {
                  emitAgentProgress(
                    controller,
                    encoder,
                    toAgentEvent({
                      kind: "plan",
                      stage: "error",
                      message: "Step 4/6 failed",
                      plan: cloneTodoPlan(updateTodoPlanStep(todoPlan, "step-4", {
                        status: "failed",
                        reason: String(floorToolError || (floorResult.success ? "Unknown error" : floorResult.error) || "Unknown error"),
                      })),
                    })
                  );
                  todoPlan = updateTodoPlanStep(todoPlan, "step-4", {
                    status: "failed",
                    reason: String(floorToolError || (floorResult.success ? "Unknown error" : floorResult.error) || "Unknown error"),
                  });
                  toolOutcomes.push({ toolName: "create_floor", status: "failed", reason: String(floorToolError || (floorResult.success ? "Unknown error" : floorResult.error) || "Unknown error") });
                  emitAgentProgress(
                    controller,
                    encoder,
                    toAgentEvent({
                      kind: "tool",
                      stage: "error",
                      message: `Floor creation skipped: ${floorToolError || (floorResult.success ? "Unknown error" : floorResult.error)}`,
                      toolName: "create_floor",
                      details: summarizeForDetails({ error: floorToolError || (floorResult.success ? "Unknown error" : floorResult.error) }),
                    })
                  );
                }
              } else {
                toolOutcomes.push({ toolName: "create_floor", status: "failed", reason: "Tool unavailable in live MCP catalog" });
              }

              if (canCreateRoom) {
                todoPlan = updateTodoPlanStep(todoPlan, "step-5", { status: "in_progress" });
                emitAgentProgress(
                  controller,
                  encoder,
                  toAgentEvent({
                    kind: "plan",
                    stage: "executing",
                    message: "Step 5/6: creating room objects",
                    plan: cloneTodoPlan(todoPlan),
                  })
                );
                const roomPayload = buildSimple2BhkRooms(levelId);
                emitAgentProgress(
                  controller,
                  encoder,
                  toAgentEvent({
                    kind: "tool",
                    stage: "executing",
                    message: "Creating core room objects",
                    toolName: "create_room",
                    details: summarizeForDetails(roomPayload, 900),
                  })
                );

                const roomResult = await executeRevitToolForUser(userId, "create_room", roomPayload);
                const roomToolError = roomResult.success ? getToolExecutionError(roomResult.result) : null;
                if (roomResult.success && !roomToolError) {
                  toolOutcomes.push({ toolName: "create_room", status: "success" });
                  todoPlan = updateTodoPlanStep(todoPlan, "step-5", { status: "completed" });
                  emitAgentProgress(
                    controller,
                    encoder,
                    toAgentEvent({
                      kind: "plan",
                      stage: "completed",
                      message: "Step 5/6 completed",
                      plan: cloneTodoPlan(todoPlan),
                    })
                  );
                  emitAgentProgress(
                    controller,
                    encoder,
                    toAgentEvent({
                      kind: "tool",
                      stage: "completed",
                      message: "Rooms created successfully",
                      toolName: "create_room",
                      details: summarizeForDetails(roomResult.result),
                    })
                  );
                } else {
                  emitAgentProgress(
                    controller,
                    encoder,
                    toAgentEvent({
                      kind: "plan",
                      stage: "error",
                      message: "Step 5/6 failed",
                      plan: cloneTodoPlan(updateTodoPlanStep(todoPlan, "step-5", {
                        status: "failed",
                        reason: String(roomToolError || (roomResult.success ? "Unknown error" : roomResult.error) || "Unknown error"),
                      })),
                    })
                  );
                  todoPlan = updateTodoPlanStep(todoPlan, "step-5", {
                    status: "failed",
                    reason: String(roomToolError || (roomResult.success ? "Unknown error" : roomResult.error) || "Unknown error"),
                  });
                  toolOutcomes.push({ toolName: "create_room", status: "failed", reason: String(roomToolError || (roomResult.success ? "Unknown error" : roomResult.error) || "Unknown error") });
                  emitAgentProgress(
                    controller,
                    encoder,
                    toAgentEvent({
                      kind: "tool",
                      stage: "error",
                      message: `Room creation skipped: ${roomToolError || (roomResult.success ? "Unknown error" : roomResult.error)}`,
                      toolName: "create_room",
                      details: summarizeForDetails({ error: roomToolError || (roomResult.success ? "Unknown error" : roomResult.error) }),
                    })
                  );
                }
              } else {
                toolOutcomes.push({ toolName: "create_room", status: "failed", reason: "Tool unavailable in live MCP catalog" });
              }

              if (canAnalyze) {
                todoPlan = updateTodoPlanStep(todoPlan, "step-6", { status: "in_progress" });
                emitAgentProgress(
                  controller,
                  encoder,
                  toAgentEvent({
                    kind: "plan",
                    stage: "executing",
                    message: "Step 6/6: verifying final model state",
                    plan: cloneTodoPlan(todoPlan),
                  })
                );
                const postAnalysisResult = await executeRevitToolForUser(userId, "analyze_layout_design", {
                  includeStructural: true,
                  includeArchitectural: true,
                  includeMEP: false,
                  includeAnnotations: false,
                  checkCodeCompliance: false,
                });
                const postAnalysisError = postAnalysisResult.success
                  ? getToolExecutionError(postAnalysisResult.result)
                  : postAnalysisResult.error;

                if (postAnalysisResult.success && !postAnalysisError) {
                  afterCounts = getAnalysisCounts(postAnalysisResult.result);
                  toolOutcomes.push({ toolName: "analyze_layout_design (post-check)", status: "success" });
                  todoPlan = updateTodoPlanStep(todoPlan, "step-6", { status: "completed" });
                } else {
                  toolOutcomes.push({ toolName: "analyze_layout_design (post-check)", status: "failed", reason: String(postAnalysisError) });
                  todoPlan = updateTodoPlanStep(todoPlan, "step-6", {
                    status: "failed",
                    reason: String(postAnalysisError),
                  });
                }

                emitAgentProgress(
                  controller,
                  encoder,
                  toAgentEvent({
                    kind: "plan",
                    stage: todoPlan.find((s) => s.id === "step-6")?.status === "completed" ? "completed" : "error",
                    message:
                      todoPlan.find((s) => s.id === "step-6")?.status === "completed"
                        ? "Step 6/6 completed"
                        : "Step 6/6 failed",
                    plan: cloneTodoPlan(todoPlan),
                  })
                );
              } else {
                toolOutcomes.push({ toolName: "analyze_layout_design (post-check)", status: "failed", reason: "Tool unavailable in live MCP catalog" });
              }

              finalResponse =
                `2BHK copilot run finished with tool-aware execution. Before/After counts => walls: ${beforeCounts.walls}→${afterCounts.walls}, floors: ${beforeCounts.floors}→${afterCounts.floors}, rooms: ${beforeCounts.rooms}→${afterCounts.rooms}.\n\n${formatToolOutcomeSummary(toolOutcomes)}`;
              emitAgentProgress(
                controller,
                encoder,
                toAgentEvent({
                  kind: "plan",
                  stage: "completed",
                  message: "Execution plan finished",
                  plan: cloneTodoPlan(todoPlan),
                })
              );
              emitContentChunk(controller, encoder, finalResponse);
            } else {
              finalResponse =
                "No active execution transport found, so I cannot build in realtime yet. Reconnect Cloud Relay (or legacy local agent) and retry this same request.";
              emitAgentProgress(
                controller,
                encoder,
                toAgentEvent({
                  kind: "plan",
                  stage: "error",
                  message: "Execution blocked: no active execution transport",
                  details: "Realtime creation requires active Cloud Relay or legacy local agent with open Revit session.",
                  plan: [
                    {
                      id: "step-1",
                      title: "Reconnect Cloud Relay / Revit Plugin",
                      status: "blocked",
                      reason: "No active Revit agent heartbeat",
                    },
                  ],
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
      enableMCP && mcpCatalogAvailable && !isAgenticBuildRequest
        ? resolveAutoToolCall(userText, availableToolNames)
        : null;

    if (autoToolCall) {
      const encoder = new TextEncoder();
      let finalResponse = "";

      const readableStream = new ReadableStream({
        async start(controller) {
          try {
            let todoPlan = buildTodoPlanFromToolCalls([
              { toolName: autoToolCall.toolName, args: autoToolCall.args },
            ]);

            emitAgentProgress(
              controller,
              encoder,
              toAgentEvent({
                kind: "plan",
                stage: "planning",
                message: `Planning execution for ${autoToolCall.toolName}`,
                toolName: autoToolCall.toolName,
                details: summarizeForDetails(autoToolCall.args, 700),
                plan: cloneTodoPlan(todoPlan),
              })
            );

            if (revitConnected) {
              todoPlan = updateTodoPlanStep(todoPlan, "step-1", {
                status: "in_progress",
              });
              emitAgentProgress(
                controller,
                encoder,
                toAgentEvent({
                  kind: "plan",
                  stage: "executing",
                  message: `Executing step 1/1: ${autoToolCall.toolName}`,
                  toolName: autoToolCall.toolName,
                  plan: cloneTodoPlan(todoPlan),
                })
              );

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

              const result = await executeRevitToolForUser(userId, autoToolCall.toolName, autoToolCall.args);
              const toolError = result.success ? getToolExecutionError(result.result) : null;

              if (result.success && !toolError) {
                todoPlan = updateTodoPlanStep(todoPlan, "step-1", {
                  status: "completed",
                });
                finalResponse = `Executed ${autoToolCall.toolName} successfully in Revit via ${result.transport.toUpperCase()}.\n\nResult:\n${JSON.stringify(result.result, null, 2)}`;
                emitAgentProgress(
                  controller,
                  encoder,
                  toAgentEvent({
                    kind: "plan",
                    stage: "completed",
                    message: "Execution plan completed",
                    plan: cloneTodoPlan(todoPlan),
                  })
                );
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
                todoPlan = updateTodoPlanStep(todoPlan, "step-1", {
                  status: "failed",
                  reason: String(toolError || (result.success ? "Unknown error" : result.error) || "Unknown error"),
                });
                finalResponse = `Execution failed for ${autoToolCall.toolName} via ${result.transport.toUpperCase()}: ${toolError || (result.success ? "Unknown error" : result.error)}`;
                emitAgentProgress(
                  controller,
                  encoder,
                  toAgentEvent({
                    kind: "plan",
                    stage: "error",
                    message: "Execution plan failed",
                    plan: cloneTodoPlan(todoPlan),
                  })
                );
                emitAgentProgress(
                  controller,
                  encoder,
                  toAgentEvent({
                    kind: "tool",
                    stage: "error",
                    message: String(toolError || (result.success ? "Unknown error" : result.error)),
                    toolName: autoToolCall.toolName,
                    details: summarizeForDetails({ error: toolError || (result.success ? "Unknown error" : result.error) }),
                  })
                );
              }

              controller.enqueue(encoder.encode(createSseData({ content: finalResponse })));
            } else {
              todoPlan = updateTodoPlanStep(todoPlan, "step-1", {
                status: "blocked",
                reason: "No active execution transport",
              });
              finalResponse =
                "I found an executable Revit action, but no active execution transport is connected. Connect Cloud Relay (or legacy local agent), keep Revit open, then retry.";
              emitAgentProgress(
                controller,
                encoder,
                toAgentEvent({
                  kind: "plan",
                  stage: "error",
                  message: "Execution plan blocked",
                  plan: cloneTodoPlan(todoPlan),
                })
              );
              emitAgentProgress(
                controller,
                encoder,
                toAgentEvent({
                  kind: "analysis",
                  stage: "error",
                  message: "No active execution transport",
                  toolName: autoToolCall.toolName,
                  details: "Execution is blocked until Cloud Relay or legacy local agent reconnects.",
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
            console.error("Auto tool execution error:", error);
            const errorMessage = error instanceof Error ? error.message : "Unknown execution error";
            const fallbackResponse = `Tool execution failed: ${errorMessage}`;
            emitContentChunk(controller, encoder, fallbackResponse);
            await prisma.chatMessage.create({
              data: {
                conversationId: conversation.id,
                role: "assistant",
                content: fallbackResponse,
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

    // ========================================================================
    // LLM-DRIVEN AGENTIC MODE
    // For complex multi-step tasks, use the LLM to plan and execute dynamically
    // ========================================================================
    const shouldUseAgenticMode = revitConnected && mcpCatalogAvailable && isAgenticBuildRequest;
    
    // Debug logging
    console.log("[AGENTIC MODE CHECK]", {
      userText,
      revitConnected,
      mcpCatalogAvailable,
      requiresAgenticMode: requiresAgenticMode(userText),
      shouldUseAgenticMode,
    });

    if (shouldUseAgenticMode) {
      const encoder = new TextEncoder();
      let finalResponse = "";

      const readableStream = new ReadableStream({
        async start(controller) {
          try {
            // Build context from previous messages
            const contextMessages = messages.slice(-5).map((m: { role: string; content: string }) => 
              `${m.role}: ${typeof m.content === 'string' ? m.content.slice(0, 300) : JSON.stringify(m.content).slice(0, 300)}`
            ).join("\n");

            const toolsList = mcpTools.map((t) => `- ${t.name}: ${t.description}`).join("\n");

            // Phase 1: Generate plan
            emitAgentProgress(
              controller,
              encoder,
              toAgentEvent({
                kind: "analysis",
                stage: "planning",
                message: "Analyzing request and generating execution plan...",
              })
            );

            const plan = await generateAgenticPlan(userText, toolsList, contextMessages, availableToolNames);

            if (plan.needsMoreInfo) {
              // Need clarification from user
              finalResponse = plan.clarificationQuestion || "Could you provide more details about what you'd like to accomplish?";
              emitAgentProgress(
                controller,
                encoder,
                toAgentEvent({
                  kind: "analysis",
                  stage: "completed",
                  message: "Need more information",
                  details: plan.analysis,
                })
              );
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
              return;
            }

            if (plan.steps.length === 0) {
              // No executable steps found
              finalResponse = `I understand you want to: ${plan.analysis}\n\nHowever, I couldn't identify specific tools to execute for this request. Could you be more specific about what Revit elements you'd like to create or modify?`;
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
              return;
            }

            // Build todo plan for UI
            let todoPlan: AgentTodoStep[] = plan.steps.map((step, index) => ({
              id: `step-${index + 1}`,
              title: step.description,
              toolName: step.toolName,
              status: "pending" as AgentTodoStepStatus,
            }));

            emitAgentProgress(
              controller,
              encoder,
              toAgentEvent({
                kind: "plan",
                stage: "planning",
                message: `Created ${plan.steps.length}-step execution plan`,
                details: plan.analysis,
                plan: cloneTodoPlan(todoPlan),
              })
            );

            // Phase 2: Execute steps with feedback loop
            const completedSteps: Array<{ step: AgenticPlanStep; result: unknown }> = [];
            let remainingSteps = [...plan.steps];
            let stepNumber = 0;
            const maxSteps = 15; // Safety limit
            const toolOutcomes: Array<{ toolName: string; status: "success" | "failed"; reason?: string }> = [];

            while (remainingSteps.length > 0 && stepNumber < maxSteps) {
              const currentStep = remainingSteps.shift()!;
              stepNumber++;

              // Update plan status
              const stepId = `step-${stepNumber}`;
              todoPlan = todoPlan.map((s) => 
                s.id === stepId ? { ...s, status: "in_progress" as AgentTodoStepStatus } : s
              );

              emitAgentProgress(
                controller,
                encoder,
                toAgentEvent({
                  kind: "plan",
                  stage: "executing",
                  message: `Executing step ${completedSteps.length + 1}/${todoPlan.length}: ${currentStep.toolName}`,
                  toolName: currentStep.toolName,
                  plan: cloneTodoPlan(todoPlan),
                })
              );

              emitAgentProgress(
                controller,
                encoder,
                toAgentEvent({
                  kind: "tool",
                  stage: "executing",
                  message: `Running ${currentStep.toolName}`,
                  toolName: currentStep.toolName,
                  details: summarizeForDetails(currentStep.args, 700),
                })
              );

              // Execute the tool
              const resolvedToolName = resolveToolAlias(currentStep.toolName);
              let normalizedArgs = currentStep.args;

              if (!availableToolNames.has(resolvedToolName)) {
                const unavailableMessage = `Tool not available in current MCP catalog: ${resolvedToolName}`;
                toolOutcomes.push({ toolName: resolvedToolName, status: "failed", reason: unavailableMessage });
                todoPlan = todoPlan.map((s) =>
                  s.id === stepId ? { ...s, status: "failed" as AgentTodoStepStatus, reason: unavailableMessage } : s
                );
                continue;
              }

              // Apply normalizations for create_wall
              if (resolvedToolName === "create_wall") {
                normalizedArgs = normalizeCreateWallArgs(normalizedArgs);
                
                // If missing baseLevelId, try to resolve it
                if (hasMissingBaseLevelId(normalizedArgs)) {
                  const levelId = await resolveDefaultLevelIdForUser(userId);
                  if (levelId) {
                    normalizedArgs = applyBaseLevelIdToWalls(normalizedArgs, levelId);
                  }
                }
              }

              const result = await executeRevitToolForUser(userId, resolvedToolName, normalizedArgs);
              const toolError = result.success ? getToolExecutionError(result.result) : null;

              if (result.success && !toolError) {
                completedSteps.push({ step: currentStep, result: result.result });
                toolOutcomes.push({ toolName: currentStep.toolName, status: "success" });

                todoPlan = todoPlan.map((s) =>
                  s.id === stepId ? { ...s, status: "completed" as AgentTodoStepStatus } : s
                );

                emitAgentProgress(
                  controller,
                  encoder,
                  toAgentEvent({
                    kind: "tool",
                    stage: "completed",
                    message: `${currentStep.toolName} completed successfully via ${result.transport.toUpperCase()}`,
                    toolName: currentStep.toolName,
                    details: summarizeForDetails(result.result, 500),
                  })
                );

                emitAgentProgress(
                  controller,
                  encoder,
                  toAgentEvent({
                    kind: "plan",
                    stage: remainingSteps.length > 0 ? "executing" : "completed",
                    message: `Step ${completedSteps.length}/${todoPlan.length} completed`,
                    plan: cloneTodoPlan(todoPlan),
                  })
                );

                // If more steps, let LLM decide if we should continue or adapt
                if (remainingSteps.length > 0 || completedSteps.length < todoPlan.length) {
                  const continuation = await determineNextAgenticAction(
                    userText,
                    completedSteps,
                    result.result,
                    remainingSteps,
                    toolsList
                  );

                  if (continuation.action === "goal_achieved") {
                    finalResponse = continuation.finalSummary || "Goal achieved successfully!";
                    break;
                  } else if (continuation.action === "error_stop") {
                    finalResponse = continuation.finalSummary || "Execution stopped due to an error.";
                    break;
                  } else if (continuation.action === "continue" && continuation.nextStep) {
                    const nextSteps = normalizeAgenticSteps([continuation.nextStep], availableToolNames);
                    if (nextSteps.length > 0) {
                      remainingSteps = [...nextSteps, ...remainingSteps];
                      todoPlan.push({
                        id: `step-${todoPlan.length + 1}`,
                        title: nextSteps[0].description,
                        toolName: nextSteps[0].toolName,
                        status: "pending",
                      });
                    }
                  } else if (continuation.action === "add_steps" && continuation.additionalSteps) {
                    // Add new steps to the plan
                    const newSteps = normalizeAgenticSteps(continuation.additionalSteps, availableToolNames);
                    remainingSteps = [...remainingSteps, ...newSteps];
                    
                    // Update todo plan with new steps
                    newSteps.forEach((step) => {
                      todoPlan.push({
                        id: `step-${todoPlan.length + 1}`,
                        title: step.description,
                        toolName: step.toolName,
                        status: "pending",
                      });
                    });

                    emitAgentProgress(
                      controller,
                      encoder,
                      toAgentEvent({
                        kind: "plan",
                        stage: "executing",
                        message: `Added ${newSteps.length} additional steps based on results`,
                        plan: cloneTodoPlan(todoPlan),
                      })
                    );
                  }
                  // For "continue", just proceed with remaining steps
                }
              } else {
                // Step failed
                const errorMessage = String(toolError || (result.success ? "Unknown error" : result.error) || "Unknown error");
                toolOutcomes.push({ toolName: currentStep.toolName, status: "failed", reason: errorMessage });

                todoPlan = todoPlan.map((s) =>
                  s.id === stepId ? { ...s, status: "failed" as AgentTodoStepStatus, reason: errorMessage } : s
                );

                emitAgentProgress(
                  controller,
                  encoder,
                  toAgentEvent({
                    kind: "tool",
                    stage: "error",
                    message: `${currentStep.toolName} failed via ${result.transport.toUpperCase()}: ${errorMessage}`,
                    toolName: currentStep.toolName,
                    details: summarizeForDetails({ error: errorMessage }),
                  })
                );

                // Let LLM decide whether to continue or stop
                const continuation = await determineNextAgenticAction(
                  userText,
                  completedSteps,
                  { error: errorMessage },
                  remainingSteps,
                  toolsList
                );

                if (continuation.action === "error_stop") {
                  finalResponse = continuation.finalSummary || `Execution stopped: ${errorMessage}`;
                  break;
                }
                if (continuation.nextStep) {
                  const nextSteps = normalizeAgenticSteps([continuation.nextStep], availableToolNames);
                  if (nextSteps.length > 0) {
                    remainingSteps = [...nextSteps, ...remainingSteps];
                    todoPlan.push({
                      id: `step-${todoPlan.length + 1}`,
                      title: nextSteps[0].description,
                      toolName: nextSteps[0].toolName,
                      status: "pending",
                    });
                  }
                }
                if (continuation.additionalSteps && continuation.additionalSteps.length > 0) {
                  const nextSteps = normalizeAgenticSteps(continuation.additionalSteps, availableToolNames);
                  if (nextSteps.length > 0) {
                    remainingSteps = [...nextSteps, ...remainingSteps];
                    nextSteps.forEach((step) => {
                      todoPlan.push({
                        id: `step-${todoPlan.length + 1}`,
                        title: step.description,
                        toolName: step.toolName,
                        status: "pending",
                      });
                    });
                  }
                }
                // Otherwise continue with remaining steps
              }
            }

            // Generate final summary if not already set
            if (!finalResponse) {
              const successCount = toolOutcomes.filter((o) => o.status === "success").length;
              const failCount = toolOutcomes.filter((o) => o.status === "failed").length;
              
              finalResponse = `Agentic execution completed.\n\n**Summary:**\n- Steps executed: ${completedSteps.length}\n- Successful: ${successCount}\n- Failed: ${failCount}\n\n${formatToolOutcomeSummary(toolOutcomes)}`;
            }

            emitAgentProgress(
              controller,
              encoder,
              toAgentEvent({
                kind: "plan",
                stage: toolOutcomes.some((o) => o.status === "failed") ? "error" : "completed",
                message: "Execution plan finished",
                plan: cloneTodoPlan(todoPlan),
              })
            );

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
          } catch (error) {
            console.error("Agentic mode error:", error);
            const errorMessage = error instanceof Error ? error.message : "Unknown error";
            emitAgentProgress(
              controller,
              encoder,
              toAgentEvent({
                kind: "analysis",
                stage: "error",
                message: `Agentic execution failed: ${errorMessage}`,
              })
            );
            const fallbackResponse = `I encountered an error during agentic execution: ${errorMessage}`;
            emitContentChunk(controller, encoder, fallbackResponse);
            await prisma.chatMessage.create({
              data: {
                conversationId: conversation.id,
                role: "assistant",
                content: fallbackResponse,
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

    // Prepare messages with system context
    const systemMessage = `You are Datum AI Copilot, an intelligent assistant specialized in architecture, BIM, and Revit automation.${mcpSystemMessage}

  Provide helpful, accurate responses and guide users on how to use available tools when relevant.
  Never output pseudo tool markup like <tool_call> or <tool_response>.`;

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
