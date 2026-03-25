"use client";

import { useState } from "react";
import { CopilotSidebar } from "@/components/copilot/copilot-sidebar";
import { ChatInterface } from "@/components/copilot/chat-interface";

export function CopilotClient() {
  const [currentConversationId, setCurrentConversationId] = useState<
    string | null
  >(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const handleNewChat = () => {
    setCurrentConversationId(null);
  };

  const handleSelectConversation = (id: string) => {
    setCurrentConversationId(id);
  };

  const handleConversationCreated = (id: string) => {
    setCurrentConversationId(id);
    setRefreshTrigger((prev) => prev + 1);
  };

  return (
    <div className="flex h-screen w-full">
      <CopilotSidebar
        currentConversationId={currentConversationId}
        onNewChat={handleNewChat}
        onSelectConversation={handleSelectConversation}
        refreshTrigger={refreshTrigger}
      />
      <div className="flex-1">
        <ChatInterface
          conversationId={currentConversationId}
          onConversationCreated={handleConversationCreated}
        />
      </div>
    </div>
  );
}
