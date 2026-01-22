"use client";
import React from "react";
import { StickyScroll } from "@/components/ui/sticky-scroll-reveal";
import { Badge } from "@/components/ui/badge";

const content = [
  {
    title: "AI-Powered Design Automation",
    description:
      "Transform your architectural workflow with intelligent CAD automation. Our AI understands natural language commands and converts them into precise technical drawings, saving hours of manual drafting work.",
    content: (
      <div className="flex h-full w-full items-center justify-center rounded-lg overflow-hidden">
        <img
          src="https://images.unsplash.com/photo-1503387762-592deb58ef4e?w=800&q=80"
          width={600}
          height={400}
          className="h-full w-full object-cover"
          alt="AI-powered architectural design"
        />
      </div>
    ),
  },
  {
    title: "Real-Time 3D Visualization",
    description:
      "See your designs come to life instantly with our advanced 3D rendering engine. Make real-time adjustments and visualize spaces before construction begins. Perfect for client presentations and design iterations.",
    content: (
      <div className="flex h-full w-full items-center justify-center rounded-lg overflow-hidden">
        <img
          src="https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=800&q=80"
          width={600}
          height={400}
          className="h-full w-full object-cover"
          alt="3D architectural visualization"
        />
      </div>
    ),
  },
  {
    title: "Natural Language Processing",
    description:
      "Simply describe what you want to build, and watch our NLP engine translate your ideas into professional CAD drawings. No complex commands or steep learning curves—just intuitive, conversational design.",
    content: (
      <div className="flex h-full w-full items-center justify-center rounded-lg overflow-hidden">
        <img
          src="https://images.unsplash.com/photo-1558403194-611308249627?w=800&q=80"
          width={600}
          height={400}
          className="h-full w-full object-cover"
          alt="Natural language design interface"
        />
      </div>
    ),
  },
  {
    title: "Collaborative Workspace",
    description:
      "Work seamlessly with your team, clients, and contractors in a unified platform. Share designs, track changes, and maintain version control automatically. Keep everyone aligned from concept to completion.",
    content: (
      <div className="flex h-full w-full items-center justify-center rounded-lg overflow-hidden">
        <img
          src="https://images.unsplash.com/photo-1497366216548-37526070297c?w=800&q=80"
          width={600}
          height={400}
          className="h-full w-full object-cover"
          alt="Collaborative design workspace"
        />
      </div>
    ),
  },
];

export function HomeAbout() {
  return (
    <div className="w-full py-20 px-4">
      <div className="max-w-7xl mx-auto mb-12 text-center">
        <Badge variant="outline" className="mb-4 border-blue-500/50 text-blue-600 dark:text-blue-400">
          Platform Features
        </Badge>
        <h2 className="text-4xl md:text-5xl font-bold text-neutral-800 dark:text-neutral-100 mb-4">
          Design Smarter, Build Faster
        </h2>
        <p className="text-lg text-neutral-600 dark:text-neutral-400 max-w-2xl mx-auto">
          Experience the future of architectural design with our AI-powered CAD automation platform.
        </p>
      </div>
      <StickyScroll content={content} />
    </div>
  );
}
