"use client";

import { config } from "@/lib/config";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Mail, Send } from "lucide-react";
import { FaLinkedin, FaInstagram } from "react-icons/fa";
import { useState } from "react";
import { toast } from "sonner";

export default function Footer() {
  const currentYear = new Date().getFullYear();
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubscribe = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email) {
      toast.error("Email Required", {
        description: "Please enter your email address to subscribe.",
      });
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch("/api/newsletter", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();

      if (response.ok) {
        toast.success("Successfully Subscribed!", {
          description: data.message || "Thank you for subscribing to our newsletter.",
        });
        setEmail("");
      } else {
        toast.error("Subscription Failed", {
          description: data.error || "Failed to subscribe. Please try again.",
        });
      }
    } catch (error) {
      console.error("Newsletter subscription error:", error);
      toast.error("Something Went Wrong", {
        description: "An unexpected error occurred. Please try again later.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <footer className="border-t bg-background">
      <div className="mx-auto max-w-7xl px-6 py-16">
        {/* Top Section */}
        <div className="grid grid-cols-1 gap-12 md:grid-cols-3">
          
          {/* Brand */}
          <div className="space-y-4">
            <h2 className="text-2xl font-semibold tracking-tight">
              {config.app.name}
            </h2>
            <p className="text-sm text-muted-foreground max-w-xs">
              AI-assisted CAD automation for architectural design, plugins, APIs, and intelligent workflows.
            </p>

            <div className="flex gap-3 pt-2">
              <a
                href="https://linkedin.com"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="LinkedIn"
                className="group rounded-lg border p-2.5 text-muted-foreground hover:border-[#0A66C2] hover:bg-[#0A66C2]/10 transition-all duration-300"
              >
                <FaLinkedin className="h-5 w-5 group-hover:text-[#0A66C2] transition-colors" />
              </a>
              <a
                href="https://instagram.com"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Instagram"
                className="group rounded-lg border p-2.5 text-muted-foreground hover:border-pink-500 hover:bg-pink-500/10 transition-all duration-300"
              >
                <FaInstagram className="h-5 w-5 group-hover:text-pink-500 transition-colors" />
              </a>
              <a
                href="mailto:support@datum.com"
                aria-label="Email"
                className="group rounded-lg border p-2.5 text-muted-foreground hover:border-primary hover:bg-primary/10 transition-all duration-300"
              >
                <Mail className="h-5 w-5 group-hover:text-primary transition-colors" />
              </a>
            </div>
          </div>

          {/* Center Links */}
          <div className="grid grid-cols-2 gap-8">
            <div>
              <h4 className="mb-4 text-sm font-semibold uppercase tracking-wide">
                Quick Links
              </h4>
              <ul className="space-y-3 text-sm">
                {[
                  ["About", "/about"],
                  ["Features", "/features"],
                  ["Documentation", "/docs"],
                  ["Pricing", "/pricing"],
                ].map(([label, href]) => (
                  <li key={label}>
                    <Link
                      href={href}
                      className="inline-block text-muted-foreground hover:text-primary transition-colors duration-200 relative after:absolute after:bottom-0 after:left-0 after:h-[2px] after:w-0 after:bg-primary hover:after:w-full after:transition-all after:duration-300"
                    >
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h4 className="mb-4 text-sm font-semibold uppercase tracking-wide">
                Help
              </h4>
              <ul className="space-y-3 text-sm">
                {[
                  ["Support", "/support"],
                  ["Contact", "/contact"],
                  ["FAQs", "/faqs"],
                  ["Status", "/status"],
                ].map(([label, href]) => (
                  <li key={label}>
                    <Link
                      href={href}
                      className="inline-block text-muted-foreground hover:text-primary transition-colors duration-200 relative after:absolute after:bottom-0 after:left-0 after:h-[2px] after:w-0 after:bg-primary hover:after:w-full after:transition-all after:duration-300"
                    >
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Newsletter */}
          <div className="space-y-4">
            <h4 className="text-sm font-semibold uppercase tracking-wide">
              Newsletter
            </h4>
            <p className="text-sm text-muted-foreground">
              Get product updates, AI insights, and architecture workflows.
            </p>
            <form onSubmit={handleSubscribe} className="flex w-full gap-2">
              <Input
                type="email"
                placeholder="Email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={isLoading}
                className="flex-1 focus-visible:ring-2 focus-visible:ring-primary"
              />
              <Button 
                size="icon" 
                type="submit" 
                disabled={isLoading}
                className="shrink-0"
              >
                <Send className={`h-4 w-4 ${isLoading ? "animate-pulse" : ""}`} />
              </Button>
            </form>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="mt-16 flex flex-col gap-4 border-t pt-6 text-sm text-muted-foreground md:flex-row md:items-center md:justify-between">
          <p>
            © {currentYear} {config.app.name}. All rights reserved. Designed & developed by <span className="font-medium">Team Datum</span>.
          </p>

          <div className="flex gap-6">
            <Link 
              href="/privacy-policy" 
              className="inline-block hover:text-primary transition-colors duration-200 relative after:absolute after:bottom-0 after:left-0 after:h-[2px] after:w-0 after:bg-primary hover:after:w-full after:transition-all after:duration-300"
            >
              Privacy Policy
            </Link>
            <Link 
              href="/terms-of-service" 
              className="inline-block hover:text-primary transition-colors duration-200 relative after:absolute after:bottom-0 after:left-0 after:h-[2px] after:w-0 after:bg-primary hover:after:w-full after:transition-all after:duration-300"
            >
              Terms of Service
            </Link>
            <Link 
              href="/sitemap" 
              className="inline-block hover:text-primary transition-colors duration-200 relative after:absolute after:bottom-0 after:left-0 after:h-[2px] after:w-0 after:bg-primary hover:after:w-full after:transition-all after:duration-300"
            >
              Sitemap
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
