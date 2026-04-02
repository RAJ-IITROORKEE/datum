"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";
import { 
  AlertCircle, 
  ArrowUp, 
  Bot, 
  Brain, 
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Code2,
  Cpu,
  Loader2,
  PanelLeft, 
  RefreshCw,
  Sparkles,
  Square,
  Target,
  Unplug,
  Wrench,
  Zap,
  Activity,
  CircleDot,
  Play,
  Pause,
  ShieldCheck,
  ShieldAlert,
  Info,
  AlertTriangle,
  FileCheck,
  XCircle,
  ListChecks
} from "lucide-react";
import { ModelSwitcher } from "./model-switcher";
import { MCPToolsDialog } from "./mcp-tools-dialog";
import { RevitConnectionMenu } from "./revit-connection-menu";
import { cn } from "@/lib/utils";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt?: string;
}

interface AgentProgressEvent {
  stage: "planning" | "executing" | "completed" | "error" | "preflight";
  message: string;
  toolName?: string;
  kind?: "analysis" | "tool" | "plan" | "preflight" | "insight" | "summary";
  details?: string;
  timestamp?: string;
  insight?: {
    type: "success" | "warning" | "error" | "info";
    title: string;
    description?: string;
  };
  plan?: Array<{
    id: string;
    title: string;
    toolName?: string;
    status: "pending" | "in_progress" | "completed" | "failed" | "blocked";
    reason?: string;
  }>;
}

interface ConnectionStatus {
  mcpConnected: boolean;
  revitConnected: boolean;
  isRelayConnected?: boolean;
  activeDevice: string | null;
  toolCount: number;
  lastChecked: number;
  preflightChecked?: boolean;
  preflightPassed?: boolean;
}

// Parse message content to separate text from code/JSON blocks
interface ContentBlock {
  type: "text" | "code" | "json" | "command";
  content: string;
  language?: string;
}

function parseMessageContent(content: string): ContentBlock[] {
  const blocks: ContentBlock[] = [];
  
  // Regex to find code blocks: ```language\ncode\n```
  const codeBlockRegex = /```(\w*)\n?([\s\S]*?)```/g;
  
  let lastIndex = 0;
  let match;
  
  // First pass: extract code blocks
  const codeMatches: Array<{ start: number; end: number; block: ContentBlock }> = [];
  while ((match = codeBlockRegex.exec(content)) !== null) {
    codeMatches.push({
      start: match.index,
      end: match.index + match[0].length,
      block: {
        type: match[1] === "json" ? "json" : "code",
        content: match[2].trim(),
        language: match[1] || "text",
      },
    });
  }
  
  // Process content with code blocks
  for (const codeMatch of codeMatches) {
    if (codeMatch.start > lastIndex) {
      const textBefore = content.slice(lastIndex, codeMatch.start).trim();
      if (textBefore) {
        blocks.push({ type: "text", content: textBefore });
      }
    }
    blocks.push(codeMatch.block);
    lastIndex = codeMatch.end;
  }
  
  // Add remaining text
  if (lastIndex < content.length) {
    const remaining = content.slice(lastIndex).trim();
    if (remaining) {
      // Check if remaining contains large JSON (more than 100 chars of JSON-like content)
      const jsonLikeContent = remaining.match(/\{[\s\S]{100,}\}/);
      if (jsonLikeContent) {
        const jsonStart = remaining.indexOf(jsonLikeContent[0]);
        if (jsonStart > 0) {
          blocks.push({ type: "text", content: remaining.slice(0, jsonStart).trim() });
        }
        blocks.push({ type: "json", content: jsonLikeContent[0] });
        const afterJson = remaining.slice(jsonStart + jsonLikeContent[0].length).trim();
        if (afterJson) {
          blocks.push({ type: "text", content: afterJson });
        }
      } else {
        blocks.push({ type: "text", content: remaining });
      }
    }
  }
  
  // If no blocks were created, return the whole content as text
  if (blocks.length === 0) {
    blocks.push({ type: "text", content });
  }
  
  return blocks;
}

// Smart message content renderer
function MessageContent({ content, isUser }: { content: string; isUser: boolean }) {
  const blocks = useMemo(() => parseMessageContent(content), [content]);
  const hasCodeOrJson = blocks.some((b) => b.type === "code" || b.type === "json");
  
  if (!hasCodeOrJson || isUser) {
    // Simple render for user messages or messages without code
    return (
      <p className={cn(
        "wrap-break-word whitespace-pre-wrap text-[15px] leading-relaxed",
        isUser ? "text-primary-foreground" : "text-foreground"
      )}>
        {content}
      </p>
    );
  }
  
  return (
    <div className="space-y-3">
      {blocks.map((block, index) => {
        if (block.type === "text") {
          return (
            <p key={index} className="wrap-break-word whitespace-pre-wrap text-[15px] leading-relaxed text-foreground">
              {block.content}
            </p>
          );
        }
        
        if (block.type === "code" || block.type === "json") {
          return (
            <Collapsible key={index} defaultOpen={false}>
              <CollapsibleTrigger className="group flex w-full items-center justify-between rounded-lg border border-border/60 bg-muted/40 px-3 py-2 text-left text-xs font-medium text-muted-foreground hover:bg-muted/60 transition-all duration-200">
                <span className="flex items-center gap-2">
                  <Code2 className="h-3.5 w-3.5 text-primary/70" />
                  <span className="font-mono">
                    {block.type === "json" ? "JSON Output" : `Code (${block.language || "text"})`}
                  </span>
                </span>
                <ChevronRight className="h-3.5 w-3.5 transition-transform duration-200 group-data-[state=open]:rotate-90" />
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-2">
                <pre className="overflow-x-auto rounded-lg bg-[#0d1117] p-4 text-xs leading-relaxed text-[#c9d1d9] font-mono border border-[#30363d]">
                  <code>{block.content}</code>
                </pre>
              </CollapsibleContent>
            </Collapsible>
          );
        }
        
        return null;
      })}
    </div>
  );
}

interface ChatInterfaceProps {
  conversationId: string | null;
  onConversationCreated: (id: string) => void;
  onOpenSidebar?: () => void;
}

export function ChatInterface({
  conversationId,
  onConversationCreated,
  onOpenSidebar,
}: Readonly<ChatInterfaceProps>) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [model, setModel] = useState("anthropic/claude-sonnet-4.5");
  const [agentEvents, setAgentEvents] = useState<AgentProgressEvent[]>([]);
  const [planExpanded, setPlanExpanded] = useState(true);
  const [activityExpanded, setActivityExpanded] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>({
    mcpConnected: false,
    revitConnected: false,
    isRelayConnected: false,
    activeDevice: null,
    toolCount: 0,
    lastChecked: 0,
    preflightChecked: false,
    preflightPassed: false,
  });
  const [connectionLostDuringExecution, setConnectionLostDuringExecution] = useState(false);
  const [preflightStatus, setPreflightStatus] = useState<"idle" | "checking" | "passed" | "failed">("idle");
  const [queuedMessages, setQueuedMessages] = useState<string[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const connectionCheckIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const processingRef = useRef(false);
  const isLoadingRef = useRef(isLoading);

  // Keep ref in sync with state
  useEffect(() => {
    isLoadingRef.current = isLoading;
  }, [isLoading]);

  // Pre-flight connection check before execution
  const performPreflightCheck = useCallback(async (): Promise<boolean> => {
    setPreflightStatus("checking");
    setAgentEvents((prev) => [
      ...prev,
      {
        stage: "preflight",
        kind: "preflight",
        message: "Running pre-flight connection check...",
        timestamp: new Date().toISOString(),
      },
    ]);

    try {
      // Add 10 second timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(`/api/copilot/mcp?t=${Date.now()}`, { 
        cache: "no-store",
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        setPreflightStatus("failed");
        setAgentEvents((prev) => [
          ...prev,
          {
            stage: "error",
            kind: "preflight",
            message: "Pre-flight check failed: Unable to reach MCP server",
            insight: {
              type: "error",
              title: "Connection Failed",
              description: "Cannot connect to the MCP server. Check your network connection and try again.",
            },
            timestamp: new Date().toISOString(),
          },
        ]);
        return false;
      }

      const data = await response.json();
      const isConnected = data.connected && (data.revitConnected || data.isRelayConnected);
      const hasTools = data.toolCount > 0;

      if (!isConnected) {
        setPreflightStatus("failed");
        setAgentEvents((prev) => [
          ...prev,
          {
            stage: "error",
            kind: "preflight",
            message: "Pre-flight check failed: Revit not connected",
            insight: {
              type: "error",
              title: "Revit Not Connected",
              description: "Please ensure Revit is running with the Datum plugin connected via Cloud Relay.",
            },
            timestamp: new Date().toISOString(),
          },
        ]);
        return false;
      }

      if (!hasTools) {
        setPreflightStatus("failed");
        setAgentEvents((prev) => [
          ...prev,
          {
            stage: "error",
            kind: "preflight",
            message: "Pre-flight check failed: No tools available",
            insight: {
              type: "warning",
              title: "No Tools Available",
              description: "The MCP server is connected but no tools are available. Check the Revit plugin status.",
            },
            timestamp: new Date().toISOString(),
          },
        ]);
        return false;
      }

      setPreflightStatus("passed");
      setConnectionStatus((prev) => ({
        ...prev,
        preflightChecked: true,
        preflightPassed: true,
      }));
      setAgentEvents((prev) => [
        ...prev,
        {
          stage: "preflight",
          kind: "preflight",
          message: `Pre-flight check passed: ${data.toolCount} tools available`,
          insight: {
            type: "success",
            title: "Connection Verified",
            description: `Ready to execute with ${data.toolCount} Revit tools via ${data.revitConnectionType === "relay" ? "Cloud Relay" : "Local Agent"}.`,
          },
          timestamp: new Date().toISOString(),
        },
      ]);
      return true;
    } catch (error) {
      setPreflightStatus("failed");
      
      // Check if error is due to timeout
      const isTimeout = error instanceof Error && error.name === "AbortError";
      const errorMessage = isTimeout 
        ? "Connection check timed out after 10 seconds"
        : (error instanceof Error ? error.message : "Unknown error");
      
      setAgentEvents((prev) => [
        ...prev,
        {
          stage: "error",
          kind: "preflight",
          message: `Pre-flight check failed: ${errorMessage}`,
          insight: {
            type: "error",
            title: isTimeout ? "Connection Timeout" : "Connection Error",
            description: isTimeout 
              ? "The connection check took too long. Ensure your network is stable and the MCP server is responding."
              : "An unexpected error occurred while checking the connection. Please try again.",
          },
          timestamp: new Date().toISOString(),
        },
      ]);
      return false;
    }
  }, []);

  // Stop the current agent execution
  const handleStop = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsLoading(false);
    setAgentEvents((prev) => [
      ...prev,
      {
        stage: "error",
        message: "Execution stopped by user",
        kind: "tool",
        timestamp: new Date().toISOString(),
      },
    ]);
  }, []);

  // Check connection status
  const checkConnectionStatus = useCallback(async () => {
    try {
      const response = await fetch(`/api/copilot/mcp?t=${Date.now()}`, { cache: "no-store" });
      if (response.ok) {
        const data = await response.json();
        const newStatus: ConnectionStatus = {
          mcpConnected: data.connected,
          revitConnected: data.revitConnected,
          isRelayConnected: data.isRelayConnected || false,
          activeDevice: data.activeDevice,
          toolCount: data.toolCount || 0,
          lastChecked: Date.now(),
        };
        
        // Check if connection was lost during execution
        if (isLoading && connectionStatus.revitConnected && !newStatus.revitConnected && !newStatus.isRelayConnected) {
          setConnectionLostDuringExecution(true);
          // Add error event to agent events
          setAgentEvents((prev) => [
            ...prev,
            {
              stage: "error",
              message: "Connection to Revit lost during execution",
              kind: "tool",
              details: "The Revit connection was interrupted. Please ensure Revit is running and the plugin is connected.",
              timestamp: new Date().toISOString(),
            },
          ]);
        }
        
        setConnectionStatus(newStatus);
      }
    } catch (error) {
      console.error("Failed to check connection status:", error);
    }
  }, [isLoading, connectionStatus.revitConnected]);

  // Start connection monitoring
  useEffect(() => {
    checkConnectionStatus();
    connectionCheckIntervalRef.current = setInterval(checkConnectionStatus, 5000);
    
    return () => {
      if (connectionCheckIntervalRef.current) {
        clearInterval(connectionCheckIntervalRef.current);
      }
    };
  }, [checkConnectionStatus]);

  // Fetch messages when conversation changes
  useEffect(() => {
    if (conversationId) {
      fetchMessages(conversationId);
    } else {
      setMessages([]);
    }
  }, [conversationId]);

  // Auto scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Cleanup abort controller on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
    };
  }, []);

  const fetchMessages = async (id: string) => {
    try {
      const response = await fetch(
        `/api/copilot/messages?conversationId=${id}`
      );
      if (response.ok) {
        const data = await response.json();
        setMessages(data);
      }
    } catch (error) {
      console.error("Failed to fetch messages:", error);
    }
  };

  const updateAssistantMessage = (assistantMessage: Message) => {
    setMessages((prev) => {
      const newMessages = [...prev];
      newMessages[newMessages.length - 1] = { ...assistantMessage };
      return newMessages;
    });
  };

  const getVisibleAgentStatus = (): string => {
    if (agentEvents.length === 0) {
      return "Analyzing request and planning execution...";
    }
    return agentEvents.at(-1)?.message ?? "Working...";
  };

  const toolEvents = agentEvents.filter((event) => event.kind === "tool" || event.kind === "analysis");
  const latestPlan = [...agentEvents].reverse().find((event) => event.kind === "plan" && event.plan)?.plan || [];
  const preflightEvents = agentEvents.filter((event) => event.kind === "preflight");
  const insightEvents = agentEvents.filter((event) => event.insight);
  const failedSteps = latestPlan.filter((step) => step.status === "failed");
  const completedSteps = latestPlan.filter((step) => step.status === "completed");

  // Get summary of execution
  const getExecutionSummary = () => {
    if (latestPlan.length === 0) return null;
    const completed = latestPlan.filter((s) => s.status === "completed").length;
    const failed = latestPlan.filter((s) => s.status === "failed").length;
    const pending = latestPlan.filter((s) => s.status === "pending").length;
    const inProgress = latestPlan.filter((s) => s.status === "in_progress").length;
    
    return { completed, failed, pending, inProgress, total: latestPlan.length };
  };

  const executionSummary = getExecutionSummary();

  const getStepStatusIcon = (status: "pending" | "in_progress" | "completed" | "failed" | "blocked") => {
    switch (status) {
      case "completed":
        return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
      case "failed":
        return <AlertCircle className="h-4 w-4 text-red-500" />;
      case "blocked":
        return <Pause className="h-4 w-4 text-amber-500" />;
      case "in_progress":
        return <Loader2 className="h-4 w-4 text-primary animate-spin" />;
      default:
        return <CircleDot className="h-4 w-4 text-muted-foreground/50" />;
    }
  };

  const getStepStatusBadge = (status: "pending" | "in_progress" | "completed" | "failed" | "blocked") => {
    const baseClasses = "text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded-full border";
    switch (status) {
      case "completed":
        return cn(baseClasses, "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20");
      case "failed":
        return cn(baseClasses, "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20");
      case "blocked":
        return cn(baseClasses, "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20");
      case "in_progress":
        return cn(baseClasses, "bg-primary/10 text-primary border-primary/20");
      default:
        return cn(baseClasses, "bg-muted/50 text-muted-foreground border-muted");
    }
  };

  // Insight Card Component for displaying insights, warnings, errors
  const InsightCard = ({ insight }: { insight: { type: "success" | "warning" | "error" | "info"; title: string; description?: string } }) => {
    const iconMap = {
      success: <CheckCircle2 className="h-4 w-4 text-emerald-500" />,
      warning: <AlertTriangle className="h-4 w-4 text-amber-500" />,
      error: <XCircle className="h-4 w-4 text-red-500" />,
      info: <Info className="h-4 w-4 text-blue-500" />,
    };
    
    const bgMap = {
      success: "bg-emerald-500/5 border-emerald-500/20",
      warning: "bg-amber-500/5 border-amber-500/20",
      error: "bg-red-500/5 border-red-500/20",
      info: "bg-blue-500/5 border-blue-500/20",
    };
    
    const titleColorMap = {
      success: "text-emerald-700 dark:text-emerald-400",
      warning: "text-amber-700 dark:text-amber-400",
      error: "text-red-700 dark:text-red-400",
      info: "text-blue-700 dark:text-blue-400",
    };
    
    return (
      <div className={cn("rounded-lg border p-3", bgMap[insight.type])}>
        <div className="flex items-start gap-2">
          {iconMap[insight.type]}
          <div className="flex-1 min-w-0">
            <p className={cn("text-sm font-medium", titleColorMap[insight.type])}>
              {insight.title}
            </p>
            {insight.description && (
              <p className="text-xs text-muted-foreground mt-0.5">
                {insight.description}
              </p>
            )}
          </div>
        </div>
      </div>
    );
  };

  // Execution Summary Component
  const ExecutionSummaryCard = () => {
    if (!executionSummary || executionSummary.total === 0) return null;
    
    const allCompleted = executionSummary.completed === executionSummary.total;
    const hasFailed = executionSummary.failed > 0;
    
    return (
      <div className={cn(
        "rounded-lg border p-3",
        allCompleted && !hasFailed && "bg-emerald-500/5 border-emerald-500/20",
        hasFailed && "bg-amber-500/5 border-amber-500/20",
        !allCompleted && !hasFailed && "bg-muted/30 border-border/40"
      )}>
        <div className="flex items-center gap-2 mb-2">
          <ListChecks className={cn(
            "h-4 w-4",
            allCompleted && !hasFailed && "text-emerald-500",
            hasFailed && "text-amber-500",
            !allCompleted && !hasFailed && "text-primary"
          )} />
          <span className="text-sm font-medium text-foreground">Execution Summary</span>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <div className="flex items-center gap-1">
            <CheckCircle2 className="h-3 w-3 text-emerald-500" />
            <span className="text-muted-foreground">{executionSummary.completed} completed</span>
          </div>
          {executionSummary.failed > 0 && (
            <div className="flex items-center gap-1">
              <XCircle className="h-3 w-3 text-red-500" />
              <span className="text-muted-foreground">{executionSummary.failed} failed</span>
            </div>
          )}
          {executionSummary.pending > 0 && (
            <div className="flex items-center gap-1">
              <CircleDot className="h-3 w-3 text-muted-foreground/50" />
              <span className="text-muted-foreground">{executionSummary.pending} pending</span>
            </div>
          )}
        </div>
      </div>
    );
  };

  // Failed Steps Summary
  const FailedStepsSummary = () => {
    if (failedSteps.length === 0) return null;
    
    return (
      <Collapsible defaultOpen={true}>
        <CollapsibleTrigger className="group flex w-full items-center justify-between rounded-lg bg-red-500/5 border border-red-500/20 px-3 py-2.5 text-left hover:bg-red-500/10 transition-colors">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-red-500" />
            <span className="text-sm font-medium text-red-700 dark:text-red-400">Failed Steps</span>
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-5 bg-red-500/10 text-red-600 border-red-500/20">
              {failedSteps.length}
            </Badge>
          </div>
          <ChevronDown className="h-4 w-4 text-red-500/70 transition-transform group-data-[state=open]:rotate-180" />
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-2">
          <div className="space-y-2">
            {failedSteps.map((step) => (
              <div
                key={step.id}
                className="rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2"
              >
                <div className="flex items-center gap-2 mb-1">
                  <XCircle className="h-3.5 w-3.5 text-red-500" />
                  {step.toolName && (
                    <code className="text-[10px] font-mono bg-red-500/10 px-1.5 py-0.5 rounded text-red-600 dark:text-red-400">
                      {step.toolName}
                    </code>
                  )}
                </div>
                <p className="text-sm text-foreground">{step.title}</p>
                {step.reason && (
                  <p className="text-xs text-red-600/80 dark:text-red-400/80 mt-1 font-mono bg-red-500/5 rounded px-2 py-1">
                    {step.reason}
                  </p>
                )}
              </div>
            ))}
          </div>
        </CollapsibleContent>
      </Collapsible>
    );
  };

  const processStreamLine = (
    line: string,
    assistantMessage: Message
  ): boolean => {
    if (!line.startsWith("data: ")) {
      return false;
    }

    const data = line.slice(6);
    if (data === "[DONE]") {
      return true;
    }

    try {
      const parsed = JSON.parse(data) as {
        content?: string;
        conversationId?: string;
        agent?: AgentProgressEvent;
      };

      if (parsed.content) {
        assistantMessage.content += parsed.content;
        updateAssistantMessage(assistantMessage);
      }

      if (parsed.conversationId && !conversationId) {
        onConversationCreated(parsed.conversationId);
      }

      if (parsed.agent) {
        setAgentEvents((prev) => [...prev, parsed.agent!]);
      }
    } catch (error) {
      console.error("Failed to parse stream chunk:", error);
    }

    return false;
  };

  const streamAssistantResponse = async (
    reader: ReadableStreamDefaultReader<Uint8Array>,
    decoder: TextDecoder,
    assistantMessage: Message
  ) => {
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      const chunk = decoder.decode(value, { stream: true });
      buffer += chunk;

      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      const shouldStop = lines.some((line) =>
        processStreamLine(line, assistantMessage)
      );

      if (shouldStop) {
        break;
      }
    }

    if (buffer.trim().length > 0) {
      processStreamLine(buffer.trim(), assistantMessage);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // If already processing, queue the message
    if (processingRef.current || isLoading) {
      if (input.trim()) {
        setQueuedMessages((prev) => [...prev, input.trim()]);
        setInput("");
      }
      return;
    }
    
    if (!input.trim()) return;

    processingRef.current = true;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: input.trim(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);
    setAgentEvents([]);
    setPlanExpanded(true);
    setActivityExpanded(false);
    setConnectionLostDuringExecution(false);
    setPreflightStatus("idle");

    // Create abort controller for this request
    abortControllerRef.current = new AbortController();

    // Perform pre-flight connection check for build/execute requests
    const isBuildRequest = /\b(create|build|make|add|place|design|construct|generate)\b/i.test(input.trim()) &&
      /\b(wall|floor|room|door|window|house|layout|bhk|bedroom)\b/i.test(input.trim());
    
    if (isBuildRequest) {
      const preflightPassed = await performPreflightCheck();
      if (!preflightPassed) {
        setIsLoading(false);
        processingRef.current = false;
        // Add error message to the chat
        const errorMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: "I cannot execute this request because the pre-flight connection check failed. Please ensure Revit is running with the Datum plugin connected, then try again.",
        };
        setMessages((prev) => [...prev, errorMessage]);
        return;
      }
    }

    try {
      const allMessages = [...messages, userMessage].map((msg) => ({
        role: msg.role,
        content: msg.content,
      }));

      const response = await fetch("/api/copilot/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages: allMessages,
          model,
          conversationId,
        }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        throw new Error("Failed to send message");
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: "",
      };

      setMessages((prev) => [...prev, assistantMessage]);

      if (reader) {
        await streamAssistantResponse(reader, decoder, assistantMessage);
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        // Request was aborted by user, don't show error
        console.log("Request aborted by user");
      } else {
        console.error("Error sending message:", error);
        setMessages((prev) => prev.slice(0, -1));
      }
    } finally {
      setIsLoading(false);
      setConnectionLostDuringExecution(false);
      setPreflightStatus("idle");
      abortControllerRef.current = null;
      processingRef.current = false;
      
      // Process queued messages if any
      if (queuedMessages.length > 0) {
        const nextMessage = queuedMessages[0];
        setQueuedMessages((prev) => prev.slice(1));
        setInput(nextMessage);
        // Auto-submit after a short delay
        setTimeout(() => {
          const form = document.querySelector("form");
          if (form) {
            form.requestSubmit();
          }
        }, 100);
      }
    }
  };

  // Connection status indicator component
  const ConnectionIndicator = () => {
    const isFullyConnected = connectionStatus.mcpConnected && (connectionStatus.revitConnected || connectionStatus.isRelayConnected);
    const isPartiallyConnected = connectionStatus.mcpConnected && !connectionStatus.revitConnected && !connectionStatus.isRelayConnected;
    
    if (connectionLostDuringExecution) {
      return (
        <div className="flex items-center gap-2 rounded-full bg-red-500/10 px-3 py-1.5 text-xs border border-red-500/20">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
            <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500"></span>
          </span>
          <span className="font-medium text-red-600 dark:text-red-400">Disconnected</span>
        </div>
      );
    }
    
    if (isFullyConnected) {
      return (
        <div className="flex items-center gap-2 rounded-full bg-emerald-500/10 px-3 py-1.5 text-xs border border-emerald-500/20">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500"></span>
          </span>
          <span className="font-medium text-emerald-600 dark:text-emerald-400">
            {connectionStatus.isRelayConnected ? "Cloud Connected" : "Connected"}
          </span>
          <span className="text-muted-foreground font-mono text-[10px]">{connectionStatus.toolCount} tools</span>
        </div>
      );
    }
    
    if (isPartiallyConnected) {
      return (
        <div className="flex items-center gap-2 rounded-full bg-amber-500/10 px-3 py-1.5 text-xs border border-amber-500/20">
          <span className="relative flex h-2 w-2">
            <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-500"></span>
          </span>
          <span className="font-medium text-amber-600 dark:text-amber-400">Revit Offline</span>
        </div>
      );
    }
    
    return (
      <div className="flex items-center gap-2 rounded-full bg-muted px-3 py-1.5 text-xs border border-border">
        <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
        <span className="text-muted-foreground">Connecting...</span>
      </div>
    );
  };

  return (
    <div className="flex h-full flex-col bg-background">
      {/* Header */}
      <header className="flex items-center justify-between gap-3 border-b border-border/60 bg-card/50 backdrop-blur-sm px-4 py-3 md:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 shrink-0 md:hidden rounded-lg"
            onClick={onOpenSidebar}
            aria-label="Open chat history"
          >
            <PanelLeft className="h-5 w-5" />
          </Button>
          
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20">
                <Cpu className="h-5 w-5 text-primary" />
              </div>
              {(connectionStatus.revitConnected || connectionStatus.isRelayConnected) && (
                <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-emerald-500 border-2 border-card" />
              )}
            </div>
            <div className="min-w-0">
              <h1 className="text-base font-semibold text-foreground tracking-tight">Datum Agent</h1>
              <p className="text-xs text-muted-foreground">BIM Automation Copilot</p>
            </div>
          </div>
          
          <div className="hidden sm:flex items-center gap-2 ml-2">
            <MCPToolsDialog />
            <ConnectionIndicator />
          </div>
        </div>
        
        <div className="flex shrink-0 items-center gap-2">
          <div className="hidden sm:block">
            <RevitConnectionMenu />
          </div>
          <div className="w-36 sm:w-44">
            <ModelSwitcher value={model} onValueChange={setModel} />
          </div>
        </div>
      </header>

      {/* Connection Lost Banner */}
      {connectionLostDuringExecution && (
        <div className="flex items-center justify-between gap-3 border-b border-red-500/20 bg-red-500/5 px-4 py-2.5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-500/10">
              <Unplug className="h-4 w-4 text-red-500" />
            </div>
            <div>
              <span className="text-sm font-medium text-red-700 dark:text-red-400">
                Connection lost during execution
              </span>
              <p className="text-xs text-red-600/70 dark:text-red-400/70">
                Check if Revit is running and the plugin is connected
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 border-red-500/30 text-red-700 hover:bg-red-500/10 dark:text-red-400"
            onClick={() => {
              setConnectionLostDuringExecution(false);
              checkConnectionStatus();
            }}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Retry
          </Button>
        </div>
      )}

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        {messages.length === 0 ? (
          <div className="flex h-full items-center justify-center p-6">
            <div className="text-center max-w-md">
              <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20">
                <Sparkles className="h-8 w-8 text-primary" />
              </div>
              <h2 className="mb-2 text-xl font-semibold text-foreground">
                Ready to automate Revit
              </h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Describe what you want to build or modify in your Revit model. 
                I&apos;ll plan and execute the steps automatically.
              </p>
              <div className="mt-6 flex flex-wrap justify-center gap-2">
                {["Create a 2BHK layout", "Analyze current model", "Add walls and doors"].map((suggestion) => (
                  <button
                    key={suggestion}
                    onClick={() => setInput(suggestion)}
                    className="rounded-full border border-border/60 bg-card/50 px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="mx-auto max-w-3xl space-y-4 p-4 md:p-6">
            {messages.map((message) => (
              <div
                key={message.id}
                className={cn(
                  "flex gap-3",
                  message.role === "user" ? "justify-end" : "justify-start"
                )}
              >
                {message.role === "assistant" && (
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20">
                    <Bot className="h-4 w-4 text-primary" />
                  </div>
                )}
                
                <div
                  className={cn(
                    "max-w-[85%] rounded-2xl px-4 py-3",
                    message.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "agent-bubble border border-border/40"
                  )}
                >
                  <MessageContent content={message.content} isUser={message.role === "user"} />
                </div>
                
                {message.role === "user" && (
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 border border-primary/20">
                    <span className="text-xs font-semibold text-primary">You</span>
                  </div>
                )}
              </div>
            ))}
            
            {/* Agent Working State */}
            {isLoading && (
              <div className="flex gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20">
                  <Bot className="h-4 w-4 text-primary animate-pulse" />
                </div>
                
                <div className="flex-1 max-w-[85%]">
                  <div className="agent-bubble agent-thinking rounded-2xl border border-border/40 p-4 space-y-4">
                    {/* Status Header */}
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-2">
                        {preflightStatus === "checking" ? (
                          <ShieldCheck className="h-4 w-4 text-primary animate-pulse" />
                        ) : preflightStatus === "failed" ? (
                          <ShieldAlert className="h-4 w-4 text-red-500" />
                        ) : (
                          <Activity className="h-4 w-4 text-primary animate-pulse" />
                        )}
                        <span className="text-sm font-medium text-foreground">
                          {preflightStatus === "checking" ? "Pre-flight Check" : 
                           preflightStatus === "failed" ? "Connection Failed" : "Agent Working"}
                        </span>
                      </div>
                      <span className="text-xs text-muted-foreground truncate flex-1">
                        {getVisibleAgentStatus()}
                      </span>
                    </div>

                    {/* Insights Section - Show important insights prominently */}
                    {insightEvents.length > 0 && (
                      <div className="space-y-2">
                        {insightEvents.slice(-3).map((event, idx) => (
                          event.insight && <InsightCard key={`insight-${idx}`} insight={event.insight} />
                        ))}
                      </div>
                    )}

                    {/* Execution Summary - Show when we have completed steps */}
                    {executionSummary && executionSummary.completed > 0 && (
                      <ExecutionSummaryCard />
                    )}

                    {/* Failed Steps - Show prominently if any */}
                    <FailedStepsSummary />
                    
                    {/* Execution Plan */}
                    {latestPlan.length > 0 && (
                      <Collapsible open={planExpanded} onOpenChange={setPlanExpanded}>
                        <CollapsibleTrigger className="group flex w-full items-center justify-between rounded-lg bg-muted/30 px-3 py-2.5 text-left hover:bg-muted/50 transition-colors">
                          <div className="flex items-center gap-2">
                            <Target className="h-4 w-4 text-primary/70" />
                            <span className="text-sm font-medium text-foreground">Execution Plan</span>
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-5">
                              {latestPlan.filter(s => s.status === "completed").length}/{latestPlan.length}
                            </Badge>
                          </div>
                          <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
                        </CollapsibleTrigger>
                        <CollapsibleContent className="pt-3">
                          <div className="space-y-1">
                            {latestPlan.map((step, index) => (
                              <div
                                key={step.id}
                                className={cn(
                                  "flex items-start gap-3 rounded-lg px-3 py-2.5 transition-colors",
                                  step.status === "in_progress" && "bg-primary/5 border border-primary/20",
                                  step.status === "completed" && "opacity-70",
                                  step.status === "failed" && "bg-red-500/5 border border-red-500/20"
                                )}
                              >
                                <div className="mt-0.5">
                                  {getStepStatusIcon(step.status)}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-xs font-mono text-muted-foreground">
                                      Step {index + 1}
                                    </span>
                                    {step.toolName && (
                                      <code className="text-[10px] font-mono bg-muted/50 px-1.5 py-0.5 rounded text-primary/80">
                                        {step.toolName}
                                      </code>
                                    )}
                                    <span className={getStepStatusBadge(step.status)}>
                                      {step.status.replace("_", " ")}
                                    </span>
                                  </div>
                                  <p className="text-sm text-foreground mt-1">{step.title}</p>
                                  {step.reason && (
                                    <p className="text-xs text-red-600/80 dark:text-red-400/80 mt-1 italic">{step.reason}</p>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </CollapsibleContent>
                      </Collapsible>
                    )}
                    
                    {/* Tool Activity - Hidden in accordion by default */}
                    {toolEvents.length > 0 && (
                      <Collapsible open={activityExpanded} onOpenChange={setActivityExpanded}>
                        <CollapsibleTrigger className="group flex w-full items-center justify-between rounded-lg bg-muted/30 px-3 py-2.5 text-left hover:bg-muted/50 transition-colors">
                          <div className="flex items-center gap-2">
                            <Wrench className="h-4 w-4 text-primary/70" />
                            <span className="text-sm font-medium text-foreground">Tool Activity Log</span>
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-5">
                              {toolEvents.length}
                            </Badge>
                          </div>
                          <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
                        </CollapsibleTrigger>
                        <CollapsibleContent className="pt-3">
                          <div className="space-y-2 max-h-64 overflow-y-auto">
                            {toolEvents.slice(-10).map((event, idx) => (
                              <div
                                key={`${event.timestamp}-${idx}`}
                                className="rounded-lg border border-border/40 bg-card/50 px-3 py-2"
                              >
                                <div className="flex items-center gap-2 mb-1">
                                  {event.stage === "completed" ? (
                                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                                  ) : event.stage === "error" ? (
                                    <AlertCircle className="h-3.5 w-3.5 text-red-500" />
                                  ) : event.stage === "executing" ? (
                                    <Loader2 className="h-3.5 w-3.5 text-primary animate-spin" />
                                  ) : (
                                    <Brain className="h-3.5 w-3.5 text-primary/70" />
                                  )}
                                  {event.toolName && (
                                    <code className="text-[10px] font-mono bg-muted/50 px-1.5 py-0.5 rounded text-primary/80">
                                      {event.toolName}
                                    </code>
                                  )}
                                  <span className={cn(
                                    "text-[10px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded-full border",
                                    event.stage === "completed" && "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
                                    event.stage === "error" && "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20",
                                    event.stage === "executing" && "bg-primary/10 text-primary border-primary/20",
                                    event.stage === "planning" && "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20"
                                  )}>
                                    {event.stage}
                                  </span>
                                </div>
                                <p className="text-xs text-foreground">{event.message}</p>
                                {event.details && (
                                  <Collapsible>
                                    <CollapsibleTrigger className="text-[10px] text-primary/70 hover:text-primary mt-1 flex items-center gap-1">
                                      <Code2 className="h-3 w-3" />
                                      <span>View Details</span>
                                      <ChevronRight className="h-3 w-3 transition-transform group-data-[state=open]:rotate-90" />
                                    </CollapsibleTrigger>
                                    <CollapsibleContent>
                                      <pre className="mt-2 text-[10px] text-muted-foreground bg-muted/30 rounded p-2 overflow-x-auto font-mono max-h-24 overflow-y-auto">
                                        {event.details.slice(0, 500)}
                                        {event.details.length > 500 && "..."}
                                      </pre>
                                    </CollapsibleContent>
                                  </Collapsible>
                                )}
                              </div>
                            ))}
                          </div>
                        </CollapsibleContent>
                      </Collapsible>
                    )}
                    
                    {/* Loading indicator when no plan yet */}
                    {latestPlan.length === 0 && preflightStatus !== "failed" && (
                      <div className="flex items-center gap-3 text-muted-foreground">
                        <div className="flex gap-1">
                          <span className="h-2 w-2 rounded-full bg-primary animate-bounce [animation-delay:-0.3s]" />
                          <span className="h-2 w-2 rounded-full bg-primary animate-bounce [animation-delay:-0.15s]" />
                          <span className="h-2 w-2 rounded-full bg-primary animate-bounce" />
                        </div>
                        <span className="text-sm">
                          {preflightStatus === "checking" ? "Verifying connection..." : "Planning execution..."}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Input Area */}
      <div className="border-t border-border/60 bg-card/30 backdrop-blur-sm p-3 md:p-4">
        <div className="mx-auto max-w-3xl">
          {/* Queued messages indicator */}
          {queuedMessages.length > 0 && (
            <div className="mb-2 flex items-center gap-2 rounded-lg bg-amber-500/10 border border-amber-500/20 px-3 py-2 text-xs">
              <Loader2 className="h-3 w-3 animate-spin text-amber-500" />
              <span className="text-amber-600 dark:text-amber-400">
                {queuedMessages.length} message{queuedMessages.length > 1 ? "s" : ""} queued
              </span>
            </div>
          )}
          
          <form
            onSubmit={handleSubmit}
            className="relative rounded-2xl border border-border/60 bg-card shadow-sm focus-within:border-primary/40 focus-within:ring-2 focus-within:ring-primary/10 transition-all"
          >
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit(e);
                }
              }}
              placeholder={isLoading ? "Type to queue your next message..." : "Describe what you want to build in Revit..."}
              className="min-h-[60px] w-full resize-none border-0 bg-transparent px-4 py-3 text-[15px] text-foreground placeholder:text-muted-foreground/60 focus-visible:ring-0 focus-visible:outline-none"
            />
            
            <div className="flex items-center justify-between gap-2 px-3 pb-3">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <kbd className="hidden sm:inline-flex h-5 items-center rounded border border-border bg-muted/50 px-1.5 font-mono text-[10px]">
                  Enter
                </kbd>
                <span className="hidden sm:inline">to send</span>
                <span className="text-muted-foreground/50">|</span>
                <span className="font-mono text-[10px] text-muted-foreground/70">
                  {model.split("/")[1]}
                </span>
              </div>
              
              <div className="flex items-center gap-2">
                {isLoading && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-8 w-8 p-0 rounded-lg text-destructive hover:bg-destructive/10"
                    onClick={handleStop}
                    title="Stop execution"
                  >
                    <Square className="h-4 w-4" />
                  </Button>
                )}
                <Button
                  type="submit"
                  size="sm"
                  className={cn(
                    "h-8 w-8 p-0 rounded-lg transition-all",
                    isLoading
                      ? "bg-amber-500 hover:bg-amber-600 text-white"
                      : "bg-primary hover:bg-primary/90 text-primary-foreground"
                  )}
                  disabled={!input.trim()}
                  title={isLoading ? "Queue message" : "Send message"}
                >
                  {isLoading ? (
                    <span className="text-xs font-semibold">+</span>
                  ) : (
                    <ArrowUp className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
