"use client";

import { useState } from "react";
import { CopilotSidebar } from "@/components/copilot/copilot-sidebar";
import { ChatInterface } from "@/components/copilot/chat-interface";
import { Sheet, SheetContent } from "@/components/ui/sheet";

export function CopilotClient() {
  const [currentConversationId, setCurrentConversationId] = useState<
    string | null
  >(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  const handleNewChat = () => {
    setCurrentConversationId(null);
  };

  const handleSelectConversation = (id: string) => {
    setCurrentConversationId(id);
    setMobileSidebarOpen(false);
  };

  const handleConversationCreated = (id: string) => {
    setCurrentConversationId(id);
    setRefreshTrigger((prev) => prev + 1);
  };

  return (
    <div className="flex h-dvh w-full overflow-hidden bg-background">
      <div className="hidden border-r md:flex md:w-72 lg:w-80 xl:w-[22rem]">
        <CopilotSidebar
          currentConversationId={currentConversationId}
          onNewChat={handleNewChat}
          onSelectConversation={handleSelectConversation}
          refreshTrigger={refreshTrigger}
        />
      </div>

      <Sheet open={mobileSidebarOpen} onOpenChange={setMobileSidebarOpen}>
        <SheetContent side="left" className="w-[85%] max-w-sm p-0 sm:w-[75%]">
          <CopilotSidebar
            currentConversationId={currentConversationId}
            onNewChat={handleNewChat}
            onSelectConversation={handleSelectConversation}
            refreshTrigger={refreshTrigger}
          />
        </SheetContent>
      </Sheet>

      <div className="min-w-0 flex-1">
        <ChatInterface
          conversationId={currentConversationId}
          onConversationCreated={handleConversationCreated}
          onOpenSidebar={() => setMobileSidebarOpen(true)}
        />
      </div>
    </div>
  );
}
