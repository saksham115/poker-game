"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Crown } from "lucide-react";

import { formatChips } from "@/lib/utils";
import type { Seat } from "@/lib/types";

interface WinnerOverlayProps {
  winners: Seat[] | null;
  pot: number;
  handStrength: string | null;
  visible: boolean;
}

function formatStrength(s: string): string {
  return s.toLowerCase().replace(/_/g, " ");
}

export function WinnerOverlay({
  winners,
  pot,
  handStrength,
  visible,
}: WinnerOverlayProps) {
  return (
    <AnimatePresence>
      {visible && winners && winners.length > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center"
        >
          <motion.div
            initial={{ scale: 0.85, y: 20, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            transition={{ type: "spring", stiffness: 200, damping: 18 }}
            className="rounded-2xl border border-gold/40 bg-black/80 backdrop-blur-xl px-8 py-5 shadow-gold-glow"
          >
            <div className="flex items-center gap-3">
              <Crown className="text-gold" size={28} />
              <div>
                <div className="text-[10px] uppercase tracking-widest text-gold/70">
                  Winner{winners.length > 1 ? "s" : ""}
                </div>
                <div className="text-xl font-bold text-foreground">
                  {winners.map((w) => w.name).join(", ")}
                </div>
                {handStrength && (
                  <div className="text-xs text-gold/80 capitalize">
                    {formatStrength(handStrength)}
                  </div>
                )}
              </div>
              <div className="ml-6 pl-6 border-l border-gold/30">
                <div className="text-[10px] uppercase tracking-widest text-gold/70">
                  Pot won
                </div>
                <div className="font-mono font-bold text-gold text-xl tabular-nums">
                  ${formatChips(pot)}
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
