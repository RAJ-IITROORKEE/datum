"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Wrench, Search, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface MCPTool {
  name: string;
  description: string;
  inputSchema: {
    type: string;
    properties: Record<string, any>;
    required?: string[];
  };
}

export function MCPToolsDialog() {
  const [open, setOpen] = useState(false);
  const [tools, setTools] = useState<MCPTool[]>([]);
  const [connected, setConnected] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTool, setSelectedTool] = useState<MCPTool | null>(null);

  useEffect(() => {
    if (open && tools.length === 0) {
      fetchTools();
    }
  }, [open]);

  const fetchTools = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/copilot/mcp");
      if (response.ok) {
        const data = await response.json();
        setConnected(Boolean(data.connected));
        setTools(data.tools || []);
      }
    } catch (error) {
      console.error("Failed to fetch MCP tools:", error);
    } finally {
      setLoading(false);
    }
  };

  const filteredTools = tools.filter(
    (tool) =>
      tool.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      tool.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          title="View MCP Tools"
        >
          <Wrench className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>Revit MCP Tools</DialogTitle>
          <DialogDescription>
            {connected === false
              ? "MCP server disconnected"
              : tools.length > 0
                ? `${tools.length} tools available for Revit automation and BIM tasks`
                : "Loading available tools..."}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Search className="h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search tools..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="flex-1"
              />
            </div>

            <ScrollArea className="h-[400px] pr-4">
              <div className="space-y-2">
                {filteredTools.length === 0 ? (
                  <div className="py-8 text-center text-sm text-muted-foreground">
                    {searchQuery ? "No tools found" : "No tools available"}
                  </div>
                ) : (
                  filteredTools.map((tool) => (
                    <div
                      key={tool.name}
                      className="rounded-lg border p-3 hover:bg-accent cursor-pointer transition-colors"
                      onClick={() => setSelectedTool(tool)}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          <h4 className="font-medium text-sm">{tool.name}</h4>
                          <p className="text-xs text-muted-foreground mt-1">
                            {tool.description}
                          </p>
                        </div>
                        {tool.inputSchema.required && (
                          <Badge variant="secondary" className="text-xs">
                            {tool.inputSchema.required.length} params
                          </Badge>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>

            {selectedTool && (
              <div className="rounded-lg border bg-muted/50 p-4">
                <h4 className="font-semibold mb-2">{selectedTool.name}</h4>
                <p className="text-sm text-muted-foreground mb-3">
                  {selectedTool.description}
                </p>
                <div className="text-xs">
                  <span className="font-medium">Parameters:</span>
                  <pre className="mt-2 rounded-md bg-background p-2 overflow-auto">
                    {JSON.stringify(selectedTool.inputSchema, null, 2)}
                  </pre>
                </div>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
