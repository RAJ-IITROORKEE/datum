"use client";
import React from "react";
import { BackgroundRippleEffect } from "@/components/ui/background-ripple-effect";
import { FlipWords } from "@/components/ui/flip-words";
import { HoverBorderGradient } from "@/components/ui/hover-border-gradient";
import { ArrowRight } from "lucide-react";

export function Hero() {
  // const words = ["designs", "structures", "spaces","layouts", "models"];
  const words = ["Stop Drafting, Start Designing", "Design at the Speed of Thought"];
  return (
    <div className="relative flex h-screen w-full flex-col items-center justify-center overflow-hidden">
      <BackgroundRippleEffect />
      <div className="relative z-10 w-full px-4">
        <h1 className="mx-auto max-w-7xl text-center text-4xl font-bold text-neutral-800 md:text-6xl lg:text-7xl dark:text-neutral-100 md:whitespace-nowrap">
          {/* Prompt ideas into{" "} */}
          {/* <FlipWords words={words} className="font-bold" /> */}
          <FlipWords words={words} className="font-bold text-center" />
        </h1>
        <p className="relative z-10 mx-auto mt-8 max-w-2xl text-center text-lg text-neutral-700 md:text-xl dark:text-neutral-400">
          From natural language to intelligent CAD—automating architectural drawings, 3D models, and spatial design.
        </p>
        <div className="mt-8 flex justify-center">
          <HoverBorderGradient
            containerClassName="rounded-full"
            as="button"
            className="group dark:bg-black bg-white text-black dark:text-white flex items-center space-x-2 px-6 py-3 cursor-pointer hover:shadow-[0_0_40px_rgba(59,130,246,0.5)] dark:hover:shadow-[0_0_50px_rgba(59,130,246,0.6)] transition-all duration-300"
          >
            <span className="text-base font-medium">Get Started</span>
            <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
          </HoverBorderGradient>
        </div>
      </div>
    </div>
  );
}
