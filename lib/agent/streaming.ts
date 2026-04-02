/**
 * SSE Streaming Utilities
 * 
 * Handles Server-Sent Events streaming for real-time
 * agent progress updates to the client.
 */

import { AgentProgressEvent } from "./types";

/**
 * Create SSE data string
 */
export function createSseData(payload: Record<string, unknown>): string {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

/**
 * SSE Stream controller wrapper
 */
export interface SseController {
  /** Send content chunk */
  sendContent(content: string): void;
  
  /** Send agent progress event */
  sendProgress(event: AgentProgressEvent): void;
  
  /** Send conversation ID */
  sendConversationId(id: string): void;
  
  /** Send done signal and close stream */
  close(): void;
  
  /** Send error and close stream */
  error(message: string): void;
}

/**
 * Create an SSE stream with controller
 */
export function createSseStream(): {
  stream: ReadableStream<Uint8Array>;
  controller: SseController;
} {
  const encoder = new TextEncoder();
  let streamController: ReadableStreamDefaultController<Uint8Array>;
  
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      streamController = controller;
    },
  });
  
  const controller: SseController = {
    sendContent(content: string) {
      streamController.enqueue(encoder.encode(createSseData({ content })));
    },
    
    sendProgress(event: AgentProgressEvent) {
      // Convert to the format expected by the frontend
      // Map event types to frontend kinds
      let kind: "analysis" | "tool" | "plan" | "preflight" | "insight" | "summary";
      switch (event.type) {
        case "executing":
          kind = "tool";
          break;
        case "planning":
        case "thinking":
          kind = "analysis";
          break;
        case "observation":
          kind = "tool";
          break;
        case "completed":
          kind = "plan";
          break;
        case "error":
          kind = "tool";
          break;
        default:
          kind = "plan";
      }

      // Build insight if step has error
      let insight: { type: "success" | "warning" | "error" | "info"; title: string; description?: string } | undefined;
      if (event.type === "completed" && !event.error) {
        insight = {
          type: "success",
          title: event.step?.toolName ? `${event.step.toolName} Completed` : "Step Completed",
          description: event.message,
        };
      } else if (event.type === "error" || event.error) {
        insight = {
          type: "error",
          title: event.step?.toolName ? `${event.step.toolName} Failed` : "Step Failed",
          description: event.error || event.message,
        };
      }

      const frontendEvent = {
        stage: event.stage,
        message: event.message,
        kind,
        toolName: event.step?.toolName,
        details: event.observation,
        plan: event.plan,
        insight,
        timestamp: event.timestamp,
      };
      
      streamController.enqueue(encoder.encode(createSseData({ agent: frontendEvent })));
    },
    
    sendConversationId(id: string) {
      streamController.enqueue(encoder.encode(createSseData({ conversationId: id })));
    },
    
    close() {
      streamController.enqueue(encoder.encode("data: [DONE]\n\n"));
      streamController.close();
    },
    
    error(message: string) {
      streamController.enqueue(encoder.encode(createSseData({ 
        agent: {
          stage: "error",
          message,
          kind: "analysis",
          insight: {
            type: "error",
            title: "Execution Error",
            description: message,
          },
          timestamp: new Date().toISOString(),
        }
      })));
      streamController.enqueue(encoder.encode(createSseData({ content: `Error: ${message}` })));
      streamController.enqueue(encoder.encode("data: [DONE]\n\n"));
      streamController.close();
    },
  };
  
  return { stream, controller };
}

/**
 * Convert agent progress to UI plan steps
 */
export function progressToPlanSteps(
  steps: Array<{
    toolName: string;
    description: string;
    status: "pending" | "in_progress" | "completed" | "failed";
    error?: string;
  }>
): Array<{
  id: string;
  title: string;
  status: string;
  toolName?: string;
  reason?: string;
}> {
  return steps.map((step, index) => ({
    id: `step-${index + 1}`,
    title: step.description,
    status: step.status,
    toolName: step.toolName,
    reason: step.error,
  }));
}

/**
 * SSE Response headers
 */
export const SSE_HEADERS = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache",
  Connection: "keep-alive",
};
