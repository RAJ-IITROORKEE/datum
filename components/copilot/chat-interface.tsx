"use client";

import { useState, useRef, useEffect, useCallback } from "react";
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
  Loader2,
  PanelLeft, 
  Plus, 
  RefreshCw,
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
  activeDevice: string | null;
  toolCount: number;
  lastChecked: number;
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
    activeDevice: null,
    toolCount: 0,
    lastChecked: 0,
  });
  const [connectionLostDuringExecution, setConnectionLostDuringExecution] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const connectionCheckIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Check connection status
  const checkConnectionStatus = useCallback(async () => {
    try {
      const response = await fetch(`/api/copilot/mcp?t=${Date.now()}`, { cache: "no-store" });
      if (response.ok) {
        const data = await response.json();
        const newStatus: ConnectionStatus = {
          mcpConnected: data.connected,
          revitConnected: data.revitConnected,
          activeDevice: data.activeDevice,
          toolCount: data.toolCount || 0,
          lastChecked: Date.now(),
        };
        
        // Check if connection was lost during execution
        if (isLoading && connectionStatus.revitConnected && !newStatus.revitConnected) {
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
    if (stage === "completed") return "bg-green-500";
    if (stage === "error") return "bg-red-500";
    return "bg-blue-500";
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
    if (status === "completed") return "bg-green-500";
    if (status === "failed") return "bg-red-500";
    if (status === "blocked") return "bg-amber-500";
    if (status === "in_progress") return "bg-blue-500";
    return "bg-muted-foreground";
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
    if (!input.trim() || isLoading) return;

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
      console.error("Error sending message:", error);
      setMessages((prev) => prev.slice(0, -1));
    } finally {
      setIsLoading(false);
      setConnectionLostDuringExecution(false);
    }
  };

  // Connection status indicator component
  const ConnectionIndicator = () => {
    const isFullyConnected = connectionStatus.mcpConnected && connectionStatus.revitConnected;
    const isPartiallyConnected = connectionStatus.mcpConnected && !connectionStatus.revitConnected;
    
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
          <span className="font-medium text-green-600 dark:text-green-400">Ready</span>
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
                    <p
                      className={cn(
                        "wrap-break-word whitespace-pre-wrap text-sm sm:text-base",
                        message.role === "user" ? "text-white" : "text-foreground"
                      )}
                    >
                      {message.content}
                    </p>
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
                                <div key={step.id} className="rounded-md bg-background px-2 py-1.5">
                                  <div className="mb-1 flex items-center gap-2 text-[11px] text-muted-foreground">
                                    <span className={cn("h-1.5 w-1.5 rounded-full", getPlanStatusDotClass(step.status))} />
                                    <span className="uppercase tracking-wide">{step.status.replace("_", " ")}</span>
                                    {step.toolName ? <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-foreground">{step.toolName}</span> : null}
                                  </div>
                                  <p className="text-xs text-foreground">{step.title}</p>
                                  {step.reason ? <p className="mt-1 text-[11px] text-muted-foreground">{step.reason}</p> : null}
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
                                <div key={`analysis-${event.timestamp ?? event.message}`} className="rounded-md bg-background px-2 py-1.5">
                                  <div className="mb-1 flex items-center gap-2 text-[11px] text-muted-foreground">
                                    <span className={cn("h-1.5 w-1.5 rounded-full", getAgentEventDotClassName(event.stage))} />
                                    <span className="uppercase tracking-wide">{event.stage}</span>
                                  </div>
                                  <p className="text-xs text-foreground">{event.message}</p>
                                  {event.details ? <pre className="mt-1 overflow-auto rounded bg-muted/50 p-2 text-[11px] text-muted-foreground">{event.details}</pre> : null}
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
                                <div key={`tool-${event.timestamp ?? event.message}-${event.toolName ?? "unknown"}`} className="rounded-md bg-background px-2 py-1.5">
                                  <div className="mb-1 flex items-center gap-2 text-[11px] text-muted-foreground">
                                    <span className={cn("h-1.5 w-1.5 rounded-full", getAgentEventDotClassName(event.stage))} />
                                    <span className="uppercase tracking-wide">{event.stage}</span>
                                    {event.toolName ? <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-foreground">{event.toolName}</span> : null}
                                  </div>
                                  <p className="text-xs text-foreground">{event.message}</p>
                                  {event.details ? <pre className="mt-1 overflow-auto rounded bg-muted/50 p-2 text-[11px] text-muted-foreground">{event.details}</pre> : null}
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
            placeholder="How can I help you today? (Tip: /run get_levels_list {})"
            className="min-h-12 sm:min-h-15 w-full resize-none border-0 bg-transparent text-sm sm:text-base text-foreground outline-none focus-visible:ring-0"
            disabled={isLoading}
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
            <Button
              type="submit"
              size="icon"
              className="h-7 w-7 sm:h-8 sm:w-8 rounded-lg bg-blue-600 text-white hover:bg-blue-700"
              disabled={!input.trim() || isLoading}
            >
              <ArrowUp className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
