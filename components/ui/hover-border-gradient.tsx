"use client";
import React from "react";
import { cn } from "@/lib/utils";
import { motion } from "motion/react";

export function HoverBorderGradient({
  children,
  containerClassName,
  className,
  as: Tag = "button",
  duration = 1,
  clockwise = true,
  ...props
}: React.PropsWithChildren<
  {
    as?: React.ElementType;
    containerClassName?: string;
    className?: string;
    duration?: number;
    clockwise?: boolean;
  } & React.HTMLAttributes<HTMLElement>
>) {
  return (
    <Tag
      className={cn(
        "relative flex rounded-full border content-center bg-slate-900/[0.8] hover:bg-slate-800 transition duration-500 items-center flex-col flex-nowrap gap-10 h-min justify-center overflow-visible p-px decoration-clone w-fit",
        containerClassName
      )}
      {...props}
    >
      <div
        className={cn(
          "w-auto text-white z-10 bg-slate-900 px-4 py-2 rounded-[inherit]",
          className
        )}
      >
        {children}
      </div>
      <motion.div
        className={cn(
          "flex-none inset-0 overflow-hidden absolute z-0 rounded-[inherit]"
        )}
        style={{
          filter: "blur(2px)",
          position: "absolute",
          width: "100%",
          height: "100%",
        }}
        initial={{ rotate: 0 }}
        animate={{
          rotate: clockwise ? 360 : -360,
        }}
        transition={{
          duration: duration,
          repeat: Infinity,
          repeatType: "loop",
          ease: "linear",
        }}
      >
        <div className="bg-[conic-gradient(from_0deg,transparent_0_340deg,white_360deg)] opacity-20 w-[150%] h-[150%] absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-0"></div>
      </motion.div>

      <div className="bg-slate-900 absolute z-1 flex-none inset-[2px] rounded-[100px]" />
    </Tag>
  );
}
