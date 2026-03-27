/**
 * Agentic System Example
 * 
 * This file demonstrates how to use the new agentic system
 * for autonomous task execution with tool calling.
 * 
 * Run this example: npx ts-node --esm lib/agent/example.ts
 */

import {
  runAgent,
  runAgentWithPlanning,
  createAgentState,
  createLogger,
  AgentTool,
  AgentProgressEvent,
} from "./index";

// Example tools (these would normally come from MCP)
const exampleTools: AgentTool[] = [
  {
    name: "get_levels_list",
    description: "Get all levels in the Revit model",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "create_wall",
    description: "Create walls in the Revit model",
    inputSchema: {
      type: "object",
      properties: {
        walls: {
          type: "array",
          description: "Array of wall definitions",
        },
      },
      required: ["walls"],
    },
  },
  {
    name: "analyze_layout_design",
    description: "Analyze the current layout design in Revit",
    inputSchema: {
      type: "object",
      properties: {
        includeStructural: { type: "boolean", description: "Include structural elements" },
        includeArchitectural: { type: "boolean", description: "Include architectural elements" },
      },
    },
  },
];

/**
 * Example 1: Basic Agent Run
 */
async function exampleBasicAgent() {
  console.log("\n=== Example 1: Basic Agent Run ===\n");
  
  const logger = createLogger(true); // Debug mode enabled
  
  const result = await runAgent({
    userId: "example-user-123",
    goal: "Create a simple wall in the Revit model",
    tools: exampleTools,
    config: {
      debug: true,
      maxIterations: 5,
    },
    logger,
    onProgress: (event: AgentProgressEvent) => {
      console.log(`[${event.type}] ${event.message}`);
    },
  });
  
  console.log("\n--- Result ---");
  console.log("Success:", result.success);
  console.log("Final Answer:", result.finalAnswer);
  console.log("Steps Taken:", result.state.currentStepNumber);
  console.log("Execution Time:", result.executionTimeMs, "ms");
}

/**
 * Example 2: Agent with Planning
 */
async function exampleAgentWithPlanning() {
  console.log("\n=== Example 2: Agent with Planning ===\n");
  
  const result = await runAgentWithPlanning({
    userId: "example-user-123",
    goal: "Build a 2BHK apartment layout with walls, floors, and room labels",
    tools: exampleTools,
    config: {
      debug: true,
      maxIterations: 10,
    },
    onProgress: (event: AgentProgressEvent) => {
      if (event.type === "planning") {
        console.log(`[PLANNING] ${event.message}`);
      } else if (event.type === "executing") {
        console.log(`[EXECUTING] Step ${event.step?.number}: ${event.step?.toolName}`);
      } else if (event.type === "observation") {
        console.log(`[OBSERVATION] ${event.message}`);
      }
    },
  });
  
  console.log("\n--- Result ---");
  console.log("Success:", result.success);
  console.log("Final Answer:", result.finalAnswer?.slice(0, 200));
  console.log("Total Steps:", result.state.steps.length);
}

/**
 * Example 3: State Inspection
 */
function exampleStateInspection() {
  console.log("\n=== Example 3: State Inspection ===\n");
  
  const state = createAgentState("Example goal", exampleTools, {
    maxIterations: 10,
  });
  
  console.log("Session ID:", state.sessionId);
  console.log("Stage:", state.stage);
  console.log("Available Tools:", Array.from(state.availableToolNames).join(", "));
  console.log("Max Iterations:", state.maxIterations);
  console.log("Started At:", state.startedAt);
}

// Run examples (uncomment to test)
// exampleBasicAgent().catch(console.error);
// exampleAgentWithPlanning().catch(console.error);
// exampleStateInspection();

console.log(`
=== Agentic System Ready ===

The agentic system provides:
- ReAct loop for autonomous task execution
- Structured JSON output enforcement
- Tool execution via MCP protocol
- Progress streaming for real-time updates
- Observability with detailed logging
- Memory and state management

To enable the new agent system, set:
  USE_NEW_AGENT_SYSTEM=true

in your environment variables.
`);

export { exampleBasicAgent, exampleAgentWithPlanning, exampleStateInspection };
