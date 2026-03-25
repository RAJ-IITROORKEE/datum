"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Plus, MessageSquare, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";

interface Conversation {
  id: string;
  title: string;
  model: string;
  createdAt: string;
  updatedAt: string;
}

interface CopilotSidebarProps {
  currentConversationId: string | null;
  onNewChat: () => void;
  onSelectConversation: (id: string) => void;
  refreshTrigger?: number;
}

export function CopilotSidebar({
  currentConversationId,
  onNewChat,
  onSelectConversation,
  refreshTrigger,
}: Readonly<CopilotSidebarProps>) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchConversations = async () => {
    try {
      const response = await fetch("/api/copilot/conversations");
      if (response.ok) {
        const data = await response.json();
        setConversations(data);
      } else if (response.status === 401) {
        console.error("Unauthorized: Please sign in");
        globalThis.location.href = "/sign-in?redirect_url=/copilot";
      } else {
        console.error("Failed to fetch conversations:", response.status);
      }
    } catch (error) {
      console.error("Failed to fetch conversations:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConversations();
  }, [refreshTrigger]);

  const renderConversationList = () => {
    if (loading) {
      return <div className="p-4 text-center text-sm text-muted-foreground">Loading...</div>;
    }

    if (conversations.length === 0) {
      return (
        <div className="p-4 text-center text-sm text-muted-foreground">
          No conversations yet
        </div>
      );
    }

    return (
      <div className="space-y-1">
        {conversations.map((conversation) => (
          <div
            key={conversation.id}
            className={cn(
              "group flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors hover:bg-blue-50 dark:hover:bg-blue-500/10",
              currentConversationId === conversation.id &&
                "bg-blue-100 text-blue-800 dark:bg-blue-500/20 dark:text-blue-200"
            )}
          >
            <button
              type="button"
              className="flex min-w-0 flex-1 items-center gap-2 text-left"
              onClick={() => onSelectConversation(conversation.id)}
            >
              <MessageSquare className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" />
              <span className="flex-1 truncate text-foreground">{conversation.title}</span>
            </button>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 opacity-0 group-hover:opacity-100 hover:text-destructive"
              onClick={(e) => handleDeleteConversation(conversation.id, e)}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        ))}
      </div>
    );
  };

  const handleDeleteConversation = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const response = await fetch(`/api/copilot/conversations?id=${id}`, {
        method: "DELETE",
      });
      if (response.ok) {
        setConversations(conversations.filter((c) => c.id !== id));
        if (currentConversationId === id) {
          onNewChat();
        }
      }
    } catch (error) {
      console.error("Failed to delete conversation:", error);
    }
  };

  return (
    <div className="flex h-full w-full flex-col bg-card">
      <div className="border-b px-4 py-3">
        <Link href="/" className="flex items-center gap-3">
          <img src="/fav.png" alt="Datumm" className="h-9 w-auto rounded-full" />
          <div>
            <p className="text-base font-semibold text-foreground">Datumm</p>
            <p className="text-xs text-blue-600 dark:text-blue-400">Copilot</p>
          </div>
        </Link>
      </div>

      <div className="p-4">
        <Button
          onClick={onNewChat}
          className="w-full justify-start gap-2 bg-blue-600 text-white hover:bg-blue-700"
          variant="default"
        >
          <Plus className="h-4 w-4" />
          New Chat
        </Button>
      </div>

      <div className="px-4 pb-2">
        <h2 className="text-sm font-semibold text-muted-foreground">
          Chat History
        </h2>
      </div>

      <ScrollArea className="flex-1 px-2">
        {renderConversationList()}
      </ScrollArea>
    </div>
  );
}
