"use client";

import React, { useRef, useState, useEffect, Suspense } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useSearchParams } from "next/navigation";
import { InfoIcon, Mail, Send, MessageSquare, Loader2 } from "lucide-react";

function ContactUsInner() {
  const form = useRef<HTMLFormElement>(null);
  const [isSending, setIsSending] = useState(false);
  const searchParams = useSearchParams();

  // Reply-mode params injected via email link
  const isReply = searchParams.get("reply") === "true";
  const threadId = searchParams.get("threadId");
  const parentId = searchParams.get("parentId");
  const prefilledEmail = searchParams.get("email");
  const prefilledName = searchParams.get("name");

  useEffect(() => {
    if (isReply && form.current) {
      const emailInput = form.current.elements.namedItem("user_email") as HTMLInputElement;
      const nameInput = form.current.elements.namedItem("user_name") as HTMLInputElement;
      if (prefilledEmail && emailInput) emailInput.value = decodeURIComponent(prefilledEmail);
      if (prefilledName && nameInput) nameInput.value = decodeURIComponent(prefilledName);
    }
  }, [isReply, prefilledEmail, prefilledName]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!form.current) return;

    const formData = new FormData(form.current);
    const data = {
      user_name: formData.get("user_name") as string,
      user_email: formData.get("user_email") as string,
      subject: formData.get("subject") as string,
      message: formData.get("message") as string,
      threadId: isReply ? threadId : undefined,
      parentId: isReply ? parentId : undefined,
    };

    if (!data.user_name || !data.user_email || !data.subject || !data.message) {
      toast.error("Please fill in all fields");
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(data.user_email)) {
      toast.error("Please enter a valid email address");
      return;
    }

    try {
      setIsSending(true);
      const endpoint = isReply ? "/api/contact-us/reply" : "/api/contact-us";
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      const result = await res.json();

      if (res.ok) {
        toast.success(
          isReply
            ? "Reply sent! We will get back to you soon."
            : "Message sent successfully! We will get back to you soon."
        );
        form.current.reset();
        if (isReply) globalThis.history.replaceState({}, "", "/contacts");
      } else if (res.status === 429) {
        toast.error(result.error || "Daily message limit reached. Please try again tomorrow.");
      } else {
        throw new Error(result.error || "Something went wrong");
      }
    } catch (err) {
      console.error("Contact form error:", err);
      toast.error("Failed to send message. Please try again.");
    } finally {
      setIsSending(false);
    }
  };

  return (
    <section className="min-h-screen flex items-center justify-center py-16 px-4 sm:px-6 lg:px-8">
      <div className="w-full max-w-4xl space-y-8">

        {/* Header */}
        <div className="text-center space-y-4">
          <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl text-foreground">
            {isReply ? "Reply to Conversation" : "Contact Us"}
          </h1>
          <Separator className="w-20 mx-auto h-1 bg-[#4292c6]" />
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            {isReply
              ? "Continue your conversation with the Datum team"
              : "Have a question or need support? Insights that drive decisions start with a conversation."}
          </p>
        </div>

        {/* Reply notice */}
        {isReply && (
          <Alert className="bg-[#9ecae1]/15 dark:bg-[#4292c6]/10 border-[#9ecae1] dark:border-[#4292c6]/40">
            <InfoIcon className="h-4 w-4 text-[#4292c6]" />
            <AlertDescription className="text-[#1e6fa3] dark:text-[#9ecae1]">
              You are replying to an existing conversation. Your message will be added to the thread.
            </AlertDescription>
          </Alert>
        )}

        {/* Info cards */}
        {!isReply && (
          <div className="grid sm:grid-cols-2 gap-4">
            <Card className="border shadow-sm">
              <CardContent className="flex items-start gap-4 pt-6">
                <div className="p-2 rounded-lg bg-[#9ecae1]/25 dark:bg-[#4292c6]/15">
                  <Mail className="h-5 w-5 text-[#4292c6]" />
                </div>
                <div>
                  <p className="font-semibold text-sm">Email Support</p>
                  <p className="text-muted-foreground text-sm mt-0.5">support@datumm.ai</p>
                  <p className="text-xs text-muted-foreground mt-1">We reply within 1–2 business days</p>
                </div>
              </CardContent>
            </Card>
            <Card className="border shadow-sm">
              <CardContent className="flex items-start gap-4 pt-6">
                <div className="p-2 rounded-lg bg-[#9ecae1]/25 dark:bg-[#4292c6]/15">
                  <MessageSquare className="h-5 w-5 text-[#4292c6]" />
                </div>
                <div>
                  <p className="font-semibold text-sm">Threaded Replies</p>
                  <p className="text-muted-foreground text-sm mt-0.5">
                    Our replies include a link to continue the conversation
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">Full thread history preserved</p>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Form */}
        <Card className="w-full rounded-xl shadow-sm border">
          <CardHeader className="pb-2">
            <CardTitle className="text-xl text-center font-semibold">
              {isReply ? "Your Reply" : <>Message <span className="text-[#4292c6]">Datum</span></>}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <form ref={form} onSubmit={handleSubmit} className="space-y-5">
              <div className="grid gap-5 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="user_name">Name *</Label>
                  <Input id="user_name" name="user_name" type="text" placeholder="Your full name" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="user_email">Email *</Label>
                  <Input id="user_email" name="user_email" type="email" placeholder="your.email@example.com" required />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="subject">Subject *</Label>
                <Input id="subject" name="subject" type="text" placeholder="What is this regarding?" required />
              </div>

              <div className="space-y-2">
                <Label htmlFor="message">Message *</Label>
                <Textarea
                  id="message"
                  name="message"
                  rows={5}
                  placeholder="Tell us how we can help you..."
                  className="min-h-[120px] resize-none"
                  required
                />
              </div>

              <Button
                type="submit"
                disabled={isSending}
                className="w-full bg-[#4292c6] hover:bg-[#2d7ab3] text-white transition-all"
                size="lg"
              >
                {isSending ? (
                  <><Loader2 className="animate-spin mr-2 h-4 w-4" />Sending...</>
                ) : (
                  <><Send className="mr-2 h-4 w-4" />{isReply ? "Send Reply" : "Send Message"}</>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}

export default function ContactUs() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
        </div>
      }
    >
      <ContactUsInner />
    </Suspense>
  );
}

