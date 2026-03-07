"use client";

import React, { useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, MessageSquare, Send, Loader2, Lock, CheckCircle, ChevronDown } from "lucide-react";

type Message = {
  id: string;
  name: string;
  email: string;
  subject: string;
  message: string;
  conversationType: "NEW_INQUIRY" | "ADMIN_REPLY" | "USER_REPLY";
  createdAt: string;
  status: string;
};

type ThreadData = {
  threadId: string;
  originalInquiry: {
    id: string;
    name: string;
    email: string;
    subject: string;
    message: string;
    createdAt: string;
  };
  messages: Message[];
  latestMessage: Message;
};

function ReplyPageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const threadId = searchParams.get("threadId");
  const prefillEmail = searchParams.get("email");
  const prefillName = searchParams.get("name");

  const [threadData, setThreadData] = useState<ThreadData | null>(null);
  const [loading, setLoading] = useState(true);
  const [replyMessage, setReplyMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [hasReplied, setHasReplied] = useState(false);

  useEffect(() => {
    if (!threadId) {
      toast.error("Invalid reply link");
      router.push("/contacts");
      return;
    }
    fetchThreadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId]);

  const fetchThreadData = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/contact-us/thread/${threadId}`);
      if (!res.ok) {
        toast.error(res.status === 404 ? "Thread not found" : "Failed to load conversation");
        router.push("/contacts");
        return;
      }
      const data = await res.json();
      setThreadData(data);
    } catch {
      toast.error("Failed to load conversation");
      router.push("/contacts");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyMessage.trim()) { toast.error("Please enter a message"); return; }
    if (!threadData) { toast.error("Thread data not available"); return; }

    try {
      setSending(true);
      const res = await fetch("/api/contact-us/reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          threadId: threadData.threadId,
          parentId: threadData.latestMessage.id,
          user_name: prefillName || threadData.originalInquiry.name,
          user_email: prefillEmail || threadData.originalInquiry.email,
          message: replyMessage,
        }),
      });

      const result = await res.json();

      if (res.ok) {
        toast.success("Reply sent successfully!");
        setHasReplied(true);
        setReplyMessage("");
        window.scrollTo({ top: 0, behavior: "smooth" });
      } else if (res.status === 429) {
        toast.error(result.error || "Daily limit exceeded");
      } else {
        throw new Error(result.error || "Failed to send reply");
      }
    } catch (err) {
      console.error("Reply error:", err);
      toast.error("Failed to send reply. Please try again.");
    } finally {
      setSending(false);
    }
  };

  const getTypeBadge = (type: Message["conversationType"]) => {
    switch (type) {
      case "NEW_INQUIRY":
        return <Badge style={{ backgroundColor: '#4292c6' }} className="text-white text-xs">Your Inquiry</Badge>;
      case "ADMIN_REPLY":
        return <Badge style={{ backgroundColor: '#4292c6' }} className="text-white text-xs">Datum Team</Badge>;
      case "USER_REPLY":
        return <Badge className="bg-emerald-600 text-white text-xs">Your Reply</Badge>;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-[#4292c6]" />
          <p className="text-muted-foreground">Loading conversation...</p>
        </div>
      </div>
    );
  }

  if (!threadData) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Alert className="max-w-md">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>Unable to load conversation. Redirecting...</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <section className="min-h-screen py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto space-y-6">

        {/* Header */}
        <div className="text-center space-y-4">
          <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
            Continue Conversation
          </h1>
          <Separator className="w-20 mx-auto h-1 bg-[#4292c6]" />
          <p className="text-lg text-muted-foreground">
            Reply to: <strong>{threadData.originalInquiry.subject}</strong>
          </p>
        </div>

        {/* Success / locked state */}
        {hasReplied && (
          <Alert className="bg-emerald-50 dark:bg-emerald-950 border-emerald-200 dark:border-emerald-800">
            <CheckCircle className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            <AlertDescription className="text-emerald-800 dark:text-emerald-200">
              <strong>Reply Sent!</strong> Your message has been added to this conversation.
              If you need further help, please{" "}
              <a href="/contacts" className="underline font-semibold">start a new inquiry</a>.
            </AlertDescription>
          </Alert>
        )}

        {/* Unified conversation timeline */}
        <Card className="border border-border shadow-sm">
          <CardHeader className="pb-2 border-b border-border/60">
            <CardTitle className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                <MessageSquare className="h-4 w-4" />
                Conversation · {threadData.messages.length} message{threadData.messages.length !== 1 ? "s" : ""}
              </span>
              <span className="text-xs text-muted-foreground font-normal normal-case tracking-normal">
                Latest on top · click to expand
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-3 px-3 space-y-0.5">
            {[...threadData.messages].reverse().map((msg, idx) => {
              const isAdmin = msg.conversationType === "ADMIN_REPLY";
              const isUser = msg.conversationType === "USER_REPLY";
              const dotColor = isAdmin ? "#4292c6" : isUser ? "#10b981" : "#94a3b8";
              const cleanMsg = msg.message.split("\n\n-------")[0];
              return (
                <details key={msg.id} open={idx === 0} className="group">
                  <summary className="flex items-center gap-3 px-2 py-3 rounded-lg cursor-pointer list-none hover:bg-muted/50 transition-colors select-none">
                    <span
                      className="shrink-0 w-2.5 h-2.5 rounded-full ring-2 ring-background"
                      style={{ backgroundColor: dotColor }}
                    />
                    <span className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-foreground">{msg.name}</span>
                      {getTypeBadge(msg.conversationType)}
                      {idx === 0 && (
                        <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: '#4292c6' }}>
                          · newest
                        </span>
                      )}
                    </span>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {new Date(msg.createdAt).toLocaleString("en-IN", {
                        month: "short", day: "numeric",
                        hour: "2-digit", minute: "2-digit",
                      })}
                    </span>
                    <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0 transition-transform duration-200 group-open:rotate-180" />
                  </summary>
                  <div
                    className="ml-8 pl-4 pb-3 pt-1.5 border-l-2"
                    style={{ borderColor: dotColor + "50" }}
                  >
                    <p className="text-sm whitespace-pre-wrap text-foreground/90 leading-relaxed">{cleanMsg}</p>
                  </div>
                </details>
              );
            })}
          </CardContent>
        </Card>

        {/* User info read-only display */}
        <Card className="bg-slate-50/50 dark:bg-slate-900/30 border-slate-200 dark:border-slate-700">
          <CardContent className="pt-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label className="text-xs text-muted-foreground">Your Name</Label>
                <p className="font-semibold text-sm mt-0.5">
                  {prefillName || threadData.originalInquiry.name}
                </p>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Your Email</Label>
                <p className="font-semibold text-sm mt-0.5">
                  {prefillEmail || threadData.originalInquiry.email}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Reply form or locked state */}
        {hasReplied ? (
          <Card className="border-emerald-200 dark:border-emerald-800">
            <CardContent className="pt-6 text-center space-y-4">
              <Lock className="h-12 w-12 mx-auto text-emerald-600 dark:text-emerald-400" />
              <h3 className="text-xl font-semibold">Thread Locked</h3>
              <p className="text-muted-foreground text-sm">
                Your reply has been submitted. If you need further assistance, start a new inquiry.
              </p>
              <Button onClick={() => router.push("/contacts")} variant="outline">
                Go to Contact Page
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Send Your Reply</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmitReply} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="reply-message">Message *</Label>
                  <Textarea
                    id="reply-message"
                    value={replyMessage}
                    onChange={(e) => setReplyMessage(e.target.value)}
                    placeholder="Type your reply here..."
                    rows={6}
                    className="resize-none"
                    required
                    disabled={sending}
                  />
                  <p className="text-xs text-muted-foreground">
                    Replying as:{" "}
                    <strong>{prefillEmail || threadData.originalInquiry.email}</strong>
                  </p>
                </div>

                <Alert className="bg-amber-50 dark:bg-amber-950 border-amber-200 dark:border-amber-800">
                  <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                  <AlertDescription className="text-amber-800 dark:text-amber-200 text-sm">
                    <strong>Note:</strong> Once you send this reply, this conversation thread will be
                    locked on this page. Please ensure your message is complete before submitting.
                  </AlertDescription>
                </Alert>

                <div className="flex gap-3">
                  <Button
                    type="submit"
                    disabled={sending || !replyMessage.trim()}
                    className="flex-1 text-white transition-all"
                    style={{ backgroundColor: '#4292c6' }}
                    onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#2d7ab3')}
                    onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#4292c6')}
                  >
                    {sending ? (
                      <><Loader2 className="animate-spin mr-2 h-4 w-4" />Sending...</>
                    ) : (
                      <><Send className="mr-2 h-4 w-4" />Send Reply</>
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => router.push("/contacts")}
                    disabled={sending}
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}
      </div>
    </section>
  );
}

export default function ReplyPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
        </div>
      }
    >
      <ReplyPageInner />
    </Suspense>
  );
}
