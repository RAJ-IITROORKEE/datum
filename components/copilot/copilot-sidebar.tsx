"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { 
  Plus, 
  MessageSquare, 
  MoreVertical, 
  Archive, 
  Edit2, 
  Trash2, 
  Tag, 
  Settings, 
  ArchiveRestore,
  X
} from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { toast } from "sonner";

interface Conversation {
  id: string;
  title: string;
  model: string;
  isArchived: boolean;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

interface CopilotSidebarProps {
  currentConversationId: string | null;
  onNewChat: () => void;
  onSelectConversation: (id: string) => void;
  refreshTrigger?: number;
}

const TAG_COLORS = [
  "bg-blue-500",
  "bg-green-500",
  "bg-yellow-500",
  "bg-red-500",
  "bg-purple-500",
  "bg-pink-500",
  "bg-indigo-500",
  "bg-orange-500",
];

export function CopilotSidebar({
  currentConversationId,
  onNewChat,
  onSelectConversation,
  refreshTrigger,
}: Readonly<CopilotSidebarProps>) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteAllDialogOpen, setDeleteAllDialogOpen] = useState(false);
  const [conversationToDelete, setConversationToDelete] = useState<string | null>(null);
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [conversationToRename, setConversationToRename] = useState<Conversation | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [tagDialogOpen, setTagDialogOpen] = useState(false);
  const [conversationToTag, setConversationToTag] = useState<Conversation | null>(null);
  const [newTag, setNewTag] = useState("");
  const [showArchived, setShowArchived] = useState(false);

  const fetchConversations = async () => {
    try {
      const url = showArchived 
        ? "/api/copilot/conversations?archived=true" 
        : "/api/copilot/conversations?archived=false";
      const response = await fetch(url);
      if (response.ok) {
        const data = await response.json();
        // Ensure all conversations have default values for new fields
        const normalizedData = data.map((conv: any) => ({
          ...conv,
          isArchived: conv.isArchived ?? false,
          tags: conv.tags ?? [],
        }));
        setConversations(normalizedData);
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
  }, [refreshTrigger, showArchived]);

  const renderConversationList = () => {
    if (loading) {
      return <div className="p-4 text-center text-sm text-muted-foreground">Loading...</div>;
    }

    if (conversations.length === 0) {
      return (
        <div className="p-4 text-center text-sm text-muted-foreground">
          {showArchived ? "No archived chats" : "No conversations yet"}
        </div>
      );
    }

    return (
      <div className="space-y-1">
        {conversations.map((conversation) => (
          <div
            key={conversation.id}
            className={cn(
              "group flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm transition-colors hover:bg-blue-50 dark:hover:bg-blue-500/10 sm:px-3",
              currentConversationId === conversation.id &&
                "bg-blue-100 text-blue-800 dark:bg-blue-500/20 dark:text-blue-200"
            )}
          >
            <button
              type="button"
              className="flex min-w-0 flex-1 items-center gap-2 text-left"
              onClick={() => onSelectConversation(conversation.id)}
            >
              <MessageSquare className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0 text-blue-600 dark:text-blue-400" />
              <div className="flex-1 min-w-0">
                <span className="block truncate text-xs sm:text-sm text-foreground">
                  {conversation.title}
                </span>
                {conversation.tags.length > 0 && (
                  <div className="flex gap-1 mt-1 flex-wrap">
                    {conversation.tags.slice(0, 2).map((tag, idx) => (
                      <Badge
                        key={idx}
                        variant="secondary"
                        className="text-[10px] px-1 py-0 h-4"
                      >
                        {tag}
                      </Badge>
                    ))}
                    {conversation.tags.length > 2 && (
                      <Badge variant="secondary" className="text-[10px] px-1 py-0 h-4">
                        +{conversation.tags.length - 2}
                      </Badge>
                    )}
                  </div>
                )}
              </div>
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={(e) => e.stopPropagation()}
                  aria-label="Chat options"
                >
                  <MoreVertical className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onClick={() => handleRename(conversation)}>
                  <Edit2 className="h-3.5 w-3.5 mr-2" />
                  Rename
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleToggleArchive(conversation)}>
                  {conversation.isArchived ? (
                    <>
                      <ArchiveRestore className="h-3.5 w-3.5 mr-2" />
                      Unarchive
                    </>
                  ) : (
                    <>
                      <Archive className="h-3.5 w-3.5 mr-2" />
                      Archive
                    </>
                  )}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleAddTag(conversation)}>
                  <Tag className="h-3.5 w-3.5 mr-2" />
                  Add Tag
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => handleDeleteConversation(conversation.id)}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5 mr-2" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ))}
      </div>
    );
  };

  const handleDeleteConversation = (id: string) => {
    setConversationToDelete(id);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!conversationToDelete) return;
    
    try {
      const response = await fetch(`/api/copilot/conversations?id=${conversationToDelete}`, {
        method: "DELETE",
      });
      if (response.ok) {
        setConversations(conversations.filter((c) => c.id !== conversationToDelete));
        if (currentConversationId === conversationToDelete) {
          onNewChat();
        }
        toast.success("Chat deleted successfully");
      } else {
        toast.error("Failed to delete chat");
      }
    } catch (error) {
      console.error("Failed to delete conversation:", error);
      toast.error("Failed to delete chat");
    } finally {
      setDeleteDialogOpen(false);
      setConversationToDelete(null);
    }
  };

  const handleDeleteAll = () => {
    setDeleteAllDialogOpen(true);
  };

  const confirmDeleteAll = async () => {
    try {
      const url = showArchived 
        ? "/api/copilot/conversations/delete-all?archived=true"
        : "/api/copilot/conversations/delete-all";
      const response = await fetch(url, {
        method: "DELETE",
      });
      if (response.ok) {
        const data = await response.json();
        setConversations([]);
        onNewChat();
        toast.success(`${data.deletedCount} chat(s) deleted successfully`);
      } else {
        toast.error("Failed to delete chats");
      }
    } catch (error) {
      console.error("Failed to delete all conversations:", error);
      toast.error("Failed to delete chats");
    } finally {
      setDeleteAllDialogOpen(false);
    }
  };

  const handleRename = (conversation: Conversation) => {
    setConversationToRename(conversation);
    setNewTitle(conversation.title);
    setRenameDialogOpen(true);
  };

  const confirmRename = async () => {
    if (!conversationToRename || !newTitle.trim()) return;
    
    try {
      const response = await fetch(`/api/copilot/conversations/${conversationToRename.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newTitle.trim() }),
      });
      
      if (response.ok) {
        const updated = await response.json();
        setConversations(conversations.map(c => 
          c.id === updated.id ? { ...c, title: updated.title } : c
        ));
        toast.success("Chat renamed successfully");
      } else {
        toast.error("Failed to rename chat");
      }
    } catch (error) {
      console.error("Failed to rename conversation:", error);
      toast.error("Failed to rename chat");
    } finally {
      setRenameDialogOpen(false);
      setConversationToRename(null);
      setNewTitle("");
    }
  };

  const handleToggleArchive = async (conversation: Conversation) => {
    try {
      const response = await fetch(`/api/copilot/conversations/${conversation.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isArchived: !conversation.isArchived }),
      });
      
      if (response.ok) {
        // Refresh the list
        fetchConversations();
        toast.success(conversation.isArchived ? "Chat unarchived" : "Chat archived");
      } else {
        toast.error("Failed to update chat");
      }
    } catch (error) {
      console.error("Failed to toggle archive:", error);
      toast.error("Failed to update chat");
    }
  };

  const handleAddTag = (conversation: Conversation) => {
    setConversationToTag(conversation);
    setNewTag("");
    setTagDialogOpen(true);
  };

  const confirmAddTag = async () => {
    if (!conversationToTag || !newTag.trim()) return;
    
    const updatedTags = [...conversationToTag.tags, newTag.trim()];
    
    try {
      const response = await fetch(`/api/copilot/conversations/${conversationToTag.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tags: updatedTags }),
      });
      
      if (response.ok) {
        const updated = await response.json();
        setConversations(conversations.map(c => 
          c.id === updated.id ? { ...c, tags: updated.tags } : c
        ));
        toast.success("Tag added successfully");
      } else {
        toast.error("Failed to add tag");
      }
    } catch (error) {
      console.error("Failed to add tag:", error);
      toast.error("Failed to add tag");
    } finally {
      setTagDialogOpen(false);
      setConversationToTag(null);
      setNewTag("");
    }
  };

  const removeTag = async (conversation: Conversation, tagToRemove: string) => {
    const updatedTags = conversation.tags.filter(t => t !== tagToRemove);
    
    try {
      const response = await fetch(`/api/copilot/conversations/${conversation.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tags: updatedTags }),
      });
      
      if (response.ok) {
        const updated = await response.json();
        setConversations(conversations.map(c => 
          c.id === updated.id ? { ...c, tags: updated.tags } : c
        ));
        toast.success("Tag removed");
      }
    } catch (error) {
      console.error("Failed to remove tag:", error);
      toast.error("Failed to remove tag");
    }
  };

  return (
    <>
      <div className="flex h-full w-full flex-col bg-card">
        {/* Header */}
        <div className="border-b px-3 py-2.5 sm:px-4 sm:py-3">
          <Link href="/" className="flex items-center gap-2.5 sm:gap-3">
            <img src="/fav.png" alt="Datumm" className="h-8 w-auto rounded-full shrink-0 sm:h-9" />
            <div>
              <p className="text-sm font-semibold text-foreground sm:text-base">Datumm</p>
              <p className="text-[10px] text-blue-600 dark:text-blue-400 sm:text-xs">Copilot</p>
            </div>
          </Link>
        </div>

        {/* New Chat Button */}
        <div className="p-3 sm:p-4">
          <Button
            onClick={onNewChat}
            className="w-full justify-start gap-2 bg-blue-600 text-white hover:bg-blue-700 text-sm"
            variant="default"
          >
            <Plus className="h-4 w-4" />
            New Chat
          </Button>
        </div>

        {/* Chat History Header */}
        <div className="px-3 pb-2 sm:px-4 flex items-center justify-between">
          <h2 className="text-xs font-semibold text-muted-foreground sm:text-sm">
            {showArchived ? "Archived Chats" : "Chat History"}
          </h2>
          {showArchived && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-xs"
              onClick={() => setShowArchived(false)}
            >
              Back
            </Button>
          )}
        </div>

        {/* Conversations List with Scroll */}
        <ScrollArea className="flex-1 px-2">
          {renderConversationList()}
        </ScrollArea>

        {/* Footer Settings */}
        <div className="border-t p-3 sm:p-4">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className="w-full justify-start gap-2 text-sm"
              >
                <Settings className="h-4 w-4" />
                Settings
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem onClick={() => setShowArchived(!showArchived)}>
                <Archive className="h-3.5 w-3.5 mr-2" />
                {showArchived ? "Active Chats" : "Archived Chats"}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={handleDeleteAll}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5 mr-2" />
                Delete All {showArchived ? "Archived" : ""} Chats
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Delete Single Chat Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Chat</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this chat? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete All Chats Dialog */}
      <AlertDialog open={deleteAllDialogOpen} onOpenChange={setDeleteAllDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete All {showArchived ? "Archived " : ""}Chats</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete all {showArchived ? "archived " : ""}chats? 
              This will permanently delete {conversations.length} chat(s) and cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeleteAll}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete All
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Rename Dialog */}
      <Dialog open={renameDialogOpen} onOpenChange={setRenameDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename Chat</DialogTitle>
            <DialogDescription>
              Enter a new name for this conversation
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="title">Chat Title</Label>
              <Input
                id="title"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="Enter chat title"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    confirmRename();
                  }
                }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={confirmRename} disabled={!newTitle.trim()}>
              Rename
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Tag Dialog */}
      <Dialog open={tagDialogOpen} onOpenChange={setTagDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Tag</DialogTitle>
            <DialogDescription>
              Add a tag to organize this conversation
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {conversationToTag && conversationToTag.tags.length > 0 && (
              <div className="space-y-2">
                <Label>Current Tags</Label>
                <div className="flex flex-wrap gap-2">
                  {conversationToTag.tags.map((tag, idx) => (
                    <Badge
                      key={idx}
                      variant="secondary"
                      className="text-xs gap-1 pr-1"
                    >
                      {tag}
                      <button
                        onClick={() => conversationToTag && removeTag(conversationToTag, tag)}
                        className="ml-1 hover:text-destructive"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="tag">New Tag</Label>
              <Input
                id="tag"
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                placeholder="Enter tag name"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    confirmAddTag();
                  }
                }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTagDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={confirmAddTag} disabled={!newTag.trim()}>
              Add Tag
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
