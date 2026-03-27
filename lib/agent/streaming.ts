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
      const frontendEvent = {
        stage: event.stage,
        message: event.message,
        kind: event.type === "executing" ? "tool" : 
              event.type === "planning" ? "analysis" : 
              event.type === "thinking" ? "analysis" : "plan",
        toolName: event.step?.toolName,
        details: event.observation,
        plan: event.plan,
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
