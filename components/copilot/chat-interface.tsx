"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ArrowUp, PanelLeft, Plus } from "lucide-react";
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
  const scrollRef = useRef<HTMLDivElement>(null);

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
      };

      if (parsed.content) {
        assistantMessage.content += parsed.content;
        updateAssistantMessage(assistantMessage);
      }

      if (parsed.conversationId && !conversationId) {
        onConversationCreated(parsed.conversationId);
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
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      const chunk = decoder.decode(value);
      const lines = chunk.split("\n");
      const shouldStop = lines.some((line) =>
        processStreamLine(line, assistantMessage)
      );

      if (shouldStop) {
        break;
      }
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
      let assistantMessage: Message = {
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
    }
  };

  return (
    <div className="flex h-full flex-col bg-background">
      {/* Header with model switcher */}
      <div className="flex items-center justify-between gap-3 border-b bg-card px-3 py-3 sm:px-4 md:px-6">
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={onOpenSidebar}
            aria-label="Open chat history"
          >
            <PanelLeft className="h-5 w-5" />
          </Button>
          <img src="/fav.png" alt="Datumm" className="h-8 w-auto rounded-full" />
          <div className="leading-tight">
            <h1 className="text-base font-semibold text-card-foreground sm:text-lg">Datumm Copilot</h1>
            <p className="text-xs text-blue-600 dark:text-blue-400">AI Assistant</p>
          </div>
          <MCPToolsDialog />
        </div>
        <div className="flex items-center gap-2">
          <RevitConnectionMenu />
          <div className="w-37.5 sm:w-50">
          <ModelSwitcher value={model} onValueChange={setModel} />
          </div>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4">
        {messages.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <div className="text-center">
              <h2 className="mb-2 text-2xl font-bold text-foreground">
                How can I help you today?
              </h2>
              <p className="text-muted-foreground">
                Start a conversation with AI assistant
              </p>
            </div>
          </div>
        ) : (
          <div className="mx-auto max-w-3xl space-y-4">
            {messages.map((message) => (
              <div
                key={message.id}
                className={cn(
                  "rounded-2xl p-4",
                  message.role === "user"
                    ? "ml-auto max-w-[85%] bg-blue-600 text-white sm:max-w-[80%]"
                    : "bg-card border border-blue-100 dark:border-blue-900/40"
                )}
              >
                <div className="flex gap-3">
                  <div
                    className={cn(
                      "flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-semibold",
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
                        "wrap-break-word whitespace-pre-wrap",
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
              <div className="rounded-2xl border border-blue-100 bg-card p-4 dark:border-blue-900/40">
                <div className="flex gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-100 font-semibold text-blue-700 dark:bg-blue-500/20 dark:text-blue-200">
                    AI
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.3s]"></div>
                    <div className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.15s]"></div>
                    <div className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground"></div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Input */}
      <div className="mx-auto w-full max-w-3xl p-3 sm:p-4">
        <form
          onSubmit={handleSubmit}
          className="flex flex-col gap-2 rounded-2xl border border-blue-100 bg-card p-2 shadow-lg dark:border-blue-900/40"
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
            className="min-h-15 w-full resize-none border-0 bg-transparent text-foreground outline-none focus-visible:ring-0"
            disabled={isLoading}
          />
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-8 w-8 rounded-lg"
              >
                <Plus className="h-4 w-4" />
              </Button>
              <span className="text-sm text-muted-foreground">
                {model.split("/")[1]}
              </span>
            </div>
            <Button
              type="submit"
              size="icon"
              className="h-8 w-8 rounded-lg bg-blue-600 text-white hover:bg-blue-700"
              disabled={!input.trim() || isLoading}
            >
              <ArrowUp className="h-4 w-4" />
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
