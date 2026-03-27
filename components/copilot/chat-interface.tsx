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
  Code2,
  Loader2,
  PanelLeft, 
  Pause,
  Play,
  Plus, 
  RefreshCw,
  Square,
  Unplug,
  Wrench,
  Zap 
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
  stage: "planning" | "executing" | "completed" | "error";
  message: string;
  toolName?: string;
  kind?: "analysis" | "tool" | "plan";
  details?: string;
  timestamp?: string;
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
  // Regex to find inline JSON objects (starting with { and ending with })
  const jsonRegex = /(\{[\s\S]*?"[\s\S]*?:[\s\S]*?\})/g;
  // Regex to find /run commands
  const commandRegex = /(\/run\s+\w+\s+\{[\s\S]*?\})/g;
  
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
        "wrap-break-word whitespace-pre-wrap text-sm sm:text-base",
        isUser ? "text-white" : "text-foreground"
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
            <p key={index} className="wrap-break-word whitespace-pre-wrap text-sm sm:text-base text-foreground">
              {block.content}
            </p>
          );
        }
        
        if (block.type === "code" || block.type === "json") {
          return (
            <Collapsible key={index} defaultOpen={false}>
              <CollapsibleTrigger className="group flex w-full items-center justify-between rounded-md border border-muted-foreground/20 bg-muted/30 px-3 py-2 text-left text-xs font-medium text-muted-foreground hover:bg-muted/50 transition-colors">
                <span className="flex items-center gap-2">
                  <Code2 className="h-3.5 w-3.5" />
                  {block.type === "json" ? "JSON Output" : `Code (${block.language || "text"})`}
                </span>
                <ChevronDown className="h-3.5 w-3.5 transition-transform group-data-[state=open]:rotate-180" />
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-2">
                <pre className="overflow-x-auto rounded-md bg-zinc-900 p-3 text-xs text-zinc-100 dark:bg-zinc-950">
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
  const [analysisOpen, setAnalysisOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>({
    mcpConnected: false,
    revitConnected: false,
    isRelayConnected: false,
    activeDevice: null,
    toolCount: 0,
    lastChecked: 0,
  });
  const [connectionLostDuringExecution, setConnectionLostDuringExecution] = useState(false);
  const [queuedMessages, setQueuedMessages] = useState<string[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const connectionCheckIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

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
              message: "Connection to Revit Agent lost during execution",
              kind: "tool",
              details: "The local Revit Agent disconnected. Ensure Revit is running and the agent terminal is active.",
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

  const getAgentEventDotClassName = (stage: AgentProgressEvent["stage"]): string => {
    if (stage === "completed") return "bg-green-500 shadow-[0_0_4px_rgba(34,197,94,0.5)]";
    if (stage === "error") return "bg-red-500 shadow-[0_0_4px_rgba(239,68,68,0.5)]";
    if (stage === "executing") return "bg-blue-500 shadow-[0_0_4px_rgba(59,130,246,0.5)] animate-pulse";
    return "bg-blue-500 shadow-[0_0_4px_rgba(59,130,246,0.5)]";
  };

  const getVisibleAgentStatus = (): string => {
    if (agentEvents.length === 0) {
      return "Thinking through your request and planning execution...";
    }
    return agentEvents.at(-1)?.message ?? "Working...";
  };

  const analysisEvents = agentEvents.filter((event) => event.kind === "analysis");
  const toolEvents = agentEvents.filter((event) => event.kind === "tool");
  const latestPlan = [...agentEvents].reverse().find((event) => event.kind === "plan" && event.plan)?.plan || [];

  const getPlanStatusDotClass = (status: "pending" | "in_progress" | "completed" | "failed" | "blocked"): string => {
    if (status === "completed") return "bg-green-500 shadow-[0_0_4px_rgba(34,197,94,0.5)]";
    if (status === "failed") return "bg-red-500 shadow-[0_0_4px_rgba(239,68,68,0.5)]";
    if (status === "blocked") return "bg-amber-500 shadow-[0_0_4px_rgba(245,158,11,0.5)]";
    if (status === "in_progress") return "bg-blue-500 shadow-[0_0_4px_rgba(59,130,246,0.5)] animate-pulse";
    return "bg-muted-foreground/40";
  };
  
  const getPlanStatusBadgeClass = (status: "pending" | "in_progress" | "completed" | "failed" | "blocked"): string => {
    if (status === "completed") return "bg-green-500/10 text-green-600 dark:text-green-400 border-green-200 dark:border-green-800";
    if (status === "failed") return "bg-red-500/10 text-red-600 dark:text-red-400 border-red-200 dark:border-red-800";
    if (status === "blocked") return "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-800";
    if (status === "in_progress") return "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800";
    return "bg-muted/50 text-muted-foreground border-muted";
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
    
    // If loading, queue the message instead of blocking
    if (isLoading) {
      if (input.trim()) {
        setQueuedMessages((prev) => [...prev, input.trim()]);
        setInput("");
      }
      return;
    }
    
    if (!input.trim()) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: input.trim(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);
    setAgentEvents([]);
    setAnalysisOpen(false);
    setToolsOpen(false);
    setConnectionLostDuringExecution(false);

    // Create abort controller for this request
    abortControllerRef.current = new AbortController();

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
      abortControllerRef.current = null;
      
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
        <div className="flex items-center gap-2 rounded-lg bg-red-500/10 px-3 py-1.5 text-xs">
          <Unplug className="h-3.5 w-3.5 text-red-500" />
          <span className="font-medium text-red-600 dark:text-red-400">Connection Lost</span>
        </div>
      );
    }
    
    if (isFullyConnected) {
      return (
        <div className="flex items-center gap-2 rounded-lg bg-green-500/10 px-3 py-1.5 text-xs">
          <Zap className="h-3.5 w-3.5 text-green-500" />
          <span className="font-medium text-green-600 dark:text-green-400">
            {connectionStatus.isRelayConnected ? "Cloud Ready" : "Ready"}
          </span>
          <span className="text-muted-foreground">({connectionStatus.toolCount} tools)</span>
        </div>
      );
    }
    
    if (isPartiallyConnected) {
      return (
        <div className="flex items-center gap-2 rounded-lg bg-amber-500/10 px-3 py-1.5 text-xs">
          <AlertCircle className="h-3.5 w-3.5 text-amber-500" />
          <span className="font-medium text-amber-600 dark:text-amber-400">Revit Offline</span>
        </div>
      );
    }
    
    return (
      <div className="flex items-center gap-2 rounded-lg bg-muted px-3 py-1.5 text-xs">
        <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
        <span className="text-muted-foreground">Connecting...</span>
      </div>
    );
  };

  return (
    <div className="flex h-full flex-col bg-background">
      {/* Header with model switcher */}
      <div className="flex items-center justify-between gap-2 border-b bg-card px-3 py-2.5 sm:gap-3 sm:px-4 sm:py-3 md:px-6">
        <div className="flex min-w-0 items-center gap-1.5 sm:gap-2 md:gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 md:hidden"
            onClick={onOpenSidebar}
            aria-label="Open chat history"
          >
            <PanelLeft className="h-5 w-5" />
          </Button>
          <img src="/fav.png" alt="Datumm" className="h-7 w-auto rounded-full shrink-0 sm:h-8" />
          <div className="min-w-0 leading-tight">
            <h1 className="truncate text-sm font-semibold text-card-foreground sm:text-base md:text-lg">Datumm Copilot</h1>
            <p className="text-[10px] text-blue-600 dark:text-blue-400 sm:text-xs">AI Assistant</p>
          </div>
          <div className="hidden sm:block">
            <MCPToolsDialog />
          </div>
          <div className="hidden md:block">
            <ConnectionIndicator />
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          <div className="hidden sm:block">
            <RevitConnectionMenu />
          </div>
          <div className="w-32 sm:w-37.5 md:w-50">
            <ModelSwitcher value={model} onValueChange={setModel} />
          </div>
        </div>
      </div>

      {/* Connection Lost Banner */}
      {connectionLostDuringExecution && (
        <div className="flex items-center justify-between gap-3 border-b border-red-200 bg-red-50 px-4 py-2 dark:border-red-900/40 dark:bg-red-950/20">
          <div className="flex items-center gap-2">
            <Unplug className="h-4 w-4 text-red-500" />
            <span className="text-sm font-medium text-red-700 dark:text-red-400">
              Connection to Revit Agent lost during execution
            </span>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1.5 border-red-200 text-red-700 hover:bg-red-100 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950"
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
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-6">
        {messages.length === 0 ? (
          <div className="flex h-full items-center justify-center p-4">
            <div className="text-center">
              <h2 className="mb-2 text-xl font-bold text-foreground sm:text-2xl">
                How can I help you today?
              </h2>
              <p className="text-sm text-muted-foreground sm:text-base">
                Start a conversation with AI assistant
              </p>
            </div>
          </div>
        ) : (
          <div className="mx-auto max-w-3xl space-y-3 sm:space-y-4">
            {messages.map((message) => (
              <div
                key={message.id}
                className={cn(
                  "rounded-2xl p-3 sm:p-4",
                  message.role === "user"
                    ? "ml-auto max-w-[90%] bg-blue-600 text-white sm:max-w-[85%] md:max-w-[80%]"
                    : "bg-card border border-blue-100 dark:border-blue-900/40"
                )}
              >
                <div className="flex gap-2 sm:gap-3">
                  <div
                    className={cn(
                      "flex h-7 w-7 sm:h-8 sm:w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold",
                      message.role === "user"
                        ? "bg-blue-700 text-white"
                        : "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-200"
                    )}
                  >
                    {message.role === "user" ? "U" : "AI"}
                  </div>
                  <div className="flex-1 space-y-2 overflow-hidden">
                    <MessageContent content={message.content} isUser={message.role === "user"} />
                  </div>
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="rounded-2xl border border-blue-100 bg-card p-3 shadow-sm dark:border-blue-900/40 sm:p-4">
                <div className="flex gap-2 sm:gap-3">
                  <div className="flex h-7 w-7 sm:h-8 sm:w-8 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-200">
                    <Bot className="h-3.5 w-3.5 sm:h-4 sm:w-4 animate-pulse" />
                  </div>
                  <div className="flex-1">
                    <div className="space-y-2 sm:space-y-3">
                      <div>
                        <p className="text-xs sm:text-sm font-medium text-foreground">Agent is building your design</p>
                        <div className="mt-1 flex items-center gap-2 text-xs sm:text-sm text-muted-foreground">
                          <div className="flex items-center gap-1">
                            <div className="h-1.5 w-1.5 sm:h-2 sm:w-2 animate-bounce rounded-full bg-blue-500 [animation-delay:-0.3s]"></div>
                            <div className="h-1.5 w-1.5 sm:h-2 sm:w-2 animate-bounce rounded-full bg-blue-500 [animation-delay:-0.15s]"></div>
                            <div className="h-1.5 w-1.5 sm:h-2 sm:w-2 animate-bounce rounded-full bg-blue-500"></div>
                          </div>
                          <span className="truncate">{getVisibleAgentStatus()}</span>
                        </div>
                      </div>

                      <Collapsible defaultOpen>
                        <CollapsibleTrigger className="group flex w-full items-center justify-between rounded-md border border-blue-100 px-3 py-2 text-left text-xs font-medium text-muted-foreground hover:bg-blue-50/50 dark:border-blue-900/40 dark:hover:bg-blue-900/10">
                          <span className="flex items-center gap-2">
                            <Brain className="h-3.5 w-3.5" />
                            Execution plan ({latestPlan.length} steps)
                          </span>
                          <ChevronDown className="h-3.5 w-3.5 transition-transform group-data-[state=open]:rotate-180" />
                        </CollapsibleTrigger>
                        <CollapsibleContent className="pt-2">
                          {latestPlan.length === 0 ? (
                            <p className="rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                              Plan will appear once the agent starts execution.
                            </p>
                          ) : (
                            <div className="space-y-2 rounded-md border bg-muted/20 p-2">
                              {latestPlan.map((step) => (
                                <div key={step.id} className="rounded-md bg-background border px-2 py-1.5 hover:border-blue-200 dark:hover:border-blue-800 transition-colors">
                                  <div className="mb-1 flex items-center gap-2 text-[11px]">
                                    <span className={cn("h-1.5 w-1.5 rounded-full", getPlanStatusDotClass(step.status))} />
                                    <Badge variant="outline" className={cn("uppercase tracking-wide px-1.5 py-0 text-[10px] font-medium", getPlanStatusBadgeClass(step.status))}>
                                      {step.status === "in_progress" && <Loader2 className="mr-1 h-2.5 w-2.5 animate-spin" />}
                                      {step.status === "completed" && <CheckCircle2 className="mr-1 h-2.5 w-2.5" />}
                                      {step.status === "failed" && <AlertCircle className="mr-1 h-2.5 w-2.5" />}
                                      {step.status.replace("_", " ")}
                                    </Badge>
                                    {step.toolName ? <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-foreground font-mono">{step.toolName}</span> : null}
                                  </div>
                                  <p className="text-xs text-foreground font-medium">{step.title}</p>
                                  {step.reason ? <p className="mt-1 text-[11px] text-muted-foreground italic">{step.reason}</p> : null}
                                </div>
                              ))}
                            </div>
                          )}
                        </CollapsibleContent>
                      </Collapsible>

                      <Collapsible open={analysisOpen} onOpenChange={setAnalysisOpen}>
                        <CollapsibleTrigger className="group flex w-full items-center justify-between rounded-md border border-blue-100 px-3 py-2 text-left text-xs font-medium text-muted-foreground hover:bg-blue-50/50 dark:border-blue-900/40 dark:hover:bg-blue-900/10">
                          <span className="flex items-center gap-2">
                            <Brain className="h-3.5 w-3.5" />
                            Hidden analysis trace
                          </span>
                          <ChevronDown className="h-3.5 w-3.5 transition-transform group-data-[state=open]:rotate-180" />
                        </CollapsibleTrigger>
                        <CollapsibleContent className="pt-2">
                          {analysisEvents.length === 0 ? (
                            <p className="rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                              Analysis details will appear here while the agent plans.
                            </p>
                          ) : (
                            <div className="space-y-2 rounded-md border bg-muted/20 p-2">
                              {analysisEvents.map((event) => (
                                <div key={`analysis-${event.timestamp ?? event.message}`} className="rounded-md bg-background border px-2 py-1.5 hover:border-purple-200 dark:hover:border-purple-800 transition-colors">
                                  <div className="mb-1 flex items-center gap-2 text-[11px]">
                                    <span className={cn("h-1.5 w-1.5 rounded-full", getAgentEventDotClassName(event.stage))} />
                                    <Badge variant="outline" className={cn(
                                      "uppercase tracking-wide px-1.5 py-0 text-[10px] font-medium",
                                      event.stage === "completed" && "bg-green-500/10 text-green-600 dark:text-green-400 border-green-200 dark:border-green-800",
                                      event.stage === "error" && "bg-red-500/10 text-red-600 dark:text-red-400 border-red-200 dark:border-red-800",
                                      event.stage === "executing" && "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800",
                                      event.stage === "planning" && "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-200 dark:border-purple-800"
                                    )}>
                                      {event.stage === "planning" && <Brain className="mr-1 h-2.5 w-2.5" />}
                                      {event.stage === "executing" && <Loader2 className="mr-1 h-2.5 w-2.5 animate-spin" />}
                                      {event.stage === "completed" && <CheckCircle2 className="mr-1 h-2.5 w-2.5" />}
                                      {event.stage === "error" && <AlertCircle className="mr-1 h-2.5 w-2.5" />}
                                      {event.stage}
                                    </Badge>
                                  </div>
                                  <p className="text-xs text-foreground font-medium">{event.message}</p>
                                  {event.details ? <pre className="mt-1 overflow-auto rounded bg-muted/50 border p-2 text-[11px] text-muted-foreground">{event.details}</pre> : null}
                                </div>
                              ))}
                            </div>
                          )}
                        </CollapsibleContent>
                      </Collapsible>

                      <Collapsible open={toolsOpen} onOpenChange={setToolsOpen}>
                        <CollapsibleTrigger className="group flex w-full items-center justify-between rounded-md border border-blue-100 px-3 py-2 text-left text-xs font-medium text-muted-foreground hover:bg-blue-50/50 dark:border-blue-900/40 dark:hover:bg-blue-900/10">
                          <span className="flex items-center gap-2">
                            <Wrench className="h-3.5 w-3.5" />
                            Tool activity ({toolEvents.length})
                          </span>
                          <ChevronDown className="h-3.5 w-3.5 transition-transform group-data-[state=open]:rotate-180" />
                        </CollapsibleTrigger>
                        <CollapsibleContent className="pt-2">
                          {toolEvents.length === 0 ? (
                            <p className="rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                              Tool execution logs will appear here once commands start running.
                            </p>
                          ) : (
                            <div className="space-y-2 rounded-md border bg-muted/20 p-2">
                              {toolEvents.map((event) => (
                                <div key={`tool-${event.timestamp ?? event.message}-${event.toolName ?? "unknown"}`} className="rounded-md bg-background border px-2 py-1.5 hover:border-blue-200 dark:hover:border-blue-800 transition-colors">
                                  <div className="mb-1 flex items-center gap-2 text-[11px]">
                                    <span className={cn("h-1.5 w-1.5 rounded-full", getAgentEventDotClassName(event.stage))} />
                                    <Badge variant="outline" className={cn(
                                      "uppercase tracking-wide px-1.5 py-0 text-[10px] font-medium",
                                      event.stage === "completed" && "bg-green-500/10 text-green-600 dark:text-green-400 border-green-200 dark:border-green-800",
                                      event.stage === "error" && "bg-red-500/10 text-red-600 dark:text-red-400 border-red-200 dark:border-red-800",
                                      event.stage === "executing" && "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800",
                                      event.stage === "planning" && "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-200 dark:border-purple-800"
                                    )}>
                                      {event.stage === "executing" && <Loader2 className="mr-1 h-2.5 w-2.5 animate-spin" />}
                                      {event.stage === "completed" && <CheckCircle2 className="mr-1 h-2.5 w-2.5" />}
                                      {event.stage === "error" && <AlertCircle className="mr-1 h-2.5 w-2.5" />}
                                      {event.stage === "planning" && <Brain className="mr-1 h-2.5 w-2.5" />}
                                      {event.stage}
                                    </Badge>
                                    {event.toolName ? <span className="rounded bg-blue-500/10 border border-blue-200 dark:border-blue-800 px-1.5 py-0.5 text-[10px] text-blue-600 dark:text-blue-400 font-mono">{event.toolName}</span> : null}
                                  </div>
                                  <p className="text-xs text-foreground font-medium">{event.message}</p>
                                  {event.details ? <pre className="mt-1 overflow-auto rounded bg-muted/50 p-2 text-[11px] text-muted-foreground border">{event.details}</pre> : null}
                                </div>
                              ))}
                            </div>
                          )}
                        </CollapsibleContent>
                      </Collapsible>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Input */}
      <div className="mx-auto w-full max-w-3xl p-2 sm:p-3 md:p-4">
        {/* Queued messages indicator */}
        {queuedMessages.length > 0 && (
          <div className="mb-2 flex items-center gap-2 rounded-lg bg-amber-500/10 px-3 py-1.5 text-xs text-amber-600 dark:text-amber-400">
            <Loader2 className="h-3 w-3 animate-spin" />
            <span>{queuedMessages.length} message{queuedMessages.length > 1 ? "s" : ""} queued</span>
          </div>
        )}
        
        <form
          onSubmit={handleSubmit}
          className="flex flex-col gap-1.5 sm:gap-2 rounded-2xl border border-blue-100 bg-card p-1.5 sm:p-2 shadow-lg dark:border-blue-900/40"
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
            placeholder={isLoading ? "Type to queue your next message..." : "How can I help you today? (Tip: /run get_levels_list {})"}
            className="min-h-12 sm:min-h-15 w-full resize-none border-0 bg-transparent text-sm sm:text-base text-foreground outline-none focus-visible:ring-0"
          />
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 sm:gap-2">
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-7 w-7 sm:h-8 sm:w-8 rounded-lg"
              >
                <Plus className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              </Button>
              <span className="text-xs sm:text-sm text-muted-foreground truncate max-w-[100px] sm:max-w-none">
                {model.split("/")[1]}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {isLoading && (
                <Button
                  type="button"
                  size="icon"
                  variant="destructive"
                  className="h-7 w-7 sm:h-8 sm:w-8 rounded-lg"
                  onClick={handleStop}
                  title="Stop execution"
                >
                  <Square className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                </Button>
              )}
              <Button
                type="submit"
                size="icon"
                className={cn(
                  "h-7 w-7 sm:h-8 sm:w-8 rounded-lg",
                  isLoading
                    ? "bg-amber-500 text-white hover:bg-amber-600"
                    : "bg-blue-600 text-white hover:bg-blue-700"
                )}
                disabled={!input.trim()}
                title={isLoading ? "Queue message" : "Send message"}
              >
                {isLoading ? (
                  <Plus className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                ) : (
                  <ArrowUp className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                )}
              </Button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
