"use client";

import { useEffect, useRef } from "react";
import { motion } from "framer-motion";

import { cn } from "@/lib/utils";
import type { LogEntry } from "@/lib/types";

interface GameLogProps {
  entries: LogEntry[];
  hideHeader?: boolean;
}

const KIND_STYLES: Record<LogEntry["kind"], string> = {
  info: "text-foreground/70",
  action: "text-foreground/90",
  street: "text-gold font-semibold uppercase tracking-wider text-[11px]",
  round: "text-gold-soft font-bold uppercase tracking-widest text-[10px] border-t border-gold/20 pt-2 mt-2",
  winner: "text-gold font-bold",
  system: "text-foreground/50 italic",
};

export function GameLog({ entries, hideHeader = false }: GameLogProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (ref.current) {
      ref.current.scrollTop = ref.current.scrollHeight;
    }
  }, [entries.length]);

  return (
    <div className={cn(
      "h-full flex flex-col",
      !hideHeader && "rounded-2xl border border-border bg-surface/60 backdrop-blur"
    )}>
      {!hideHeader && (
        <div className="border-b border-border px-4 py-3">
          <h2 className="text-xs uppercase tracking-widest text-foreground/60 font-semibold">
            Hand history
          </h2>
        </div>
      )}
      <div
        ref={ref}
        className="flex-1 overflow-y-auto px-4 py-3 space-y-1 text-xs font-mono"
        role="log"
        aria-live="polite"
      >
        {entries.length === 0 ? (
          <p className="text-foreground/40 italic">Waiting for game to start…</p>
        ) : (
          entries.map((e) => (
            <motion.div
              key={e.id}
              initial={{ opacity: 0, x: -4 }}
              animate={{ opacity: 1, x: 0 }}
              className={cn("leading-relaxed", KIND_STYLES[e.kind])}
            >
              {e.text}
            </motion.div>
          ))
        )}
      </div>
    </div>
  );
}
