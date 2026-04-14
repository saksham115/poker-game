"use client";

import { motion } from "framer-motion";

import { cn } from "@/lib/utils";

const SUIT_GLYPH: Record<string, string> = {
  C: "♣",
  D: "♦",
  H: "♥",
  S: "♠",
};

const SUIT_COLOR: Record<string, string> = {
  C: "text-slate-900",
  D: "text-red-600",
  H: "text-red-600",
  S: "text-slate-900",
};

const RANK_DISPLAY: Record<string, string> = {
  A: "A",
  K: "K",
  Q: "Q",
  J: "J",
  T: "10",
};

function formatRank(r: string): string {
  return RANK_DISPLAY[r] ?? r;
}

export interface PlayingCardProps {
  card?: string;
  faceDown?: boolean;
  size?: "sm" | "md" | "lg";
  dim?: boolean;
  className?: string;
  delay?: number;
}

const SIZE_CLASSES: Record<NonNullable<PlayingCardProps["size"]>, string> = {
  sm: "w-9 h-12 text-[11px]",
  md: "w-12 h-16 text-sm",
  lg: "w-16 h-24 text-lg",
};

export function PlayingCard({
  card,
  faceDown = false,
  size = "md",
  dim = false,
  className,
  delay = 0,
}: PlayingCardProps) {
  const suitChar = card?.[0] ?? "";
  const rankChar = card?.[1] ?? "";
  const glyph = SUIT_GLYPH[suitChar] ?? "";
  const color = SUIT_COLOR[suitChar] ?? "text-slate-900";

  return (
    <motion.div
      initial={{ opacity: 0, y: -22, rotate: -6, scale: 0.9 }}
      animate={{ opacity: dim ? 0.4 : 1, y: 0, rotate: 0, scale: 1 }}
      transition={{
        type: "spring",
        stiffness: 260,
        damping: 22,
        delay,
      }}
      className={cn(
        "relative shrink-0 rounded-md shadow-card font-semibold select-none",
        SIZE_CLASSES[size],
        faceDown
          ? "bg-gradient-to-br from-[#1e293b] via-[#0f172a] to-[#020617] border border-gold/25"
          : "bg-gradient-to-br from-white via-white to-slate-100 border border-white/50",
        className
      )}
      aria-label={faceDown ? "Face-down card" : `${formatRank(rankChar)} of ${suitChar}`}
    >
      {faceDown ? (
        <div className="absolute inset-1 rounded border border-gold/30 bg-[repeating-linear-gradient(45deg,rgba(212,175,55,0.08)_0_6px,transparent_6px_12px)]" />
      ) : (
        <>
          <div className={cn("absolute left-1 top-0.5 leading-none flex flex-col items-center", color)}>
            <span className="font-bold">{formatRank(rankChar)}</span>
            <span className="text-[10px] -mt-0.5">{glyph}</span>
          </div>
          <div className={cn("absolute inset-0 flex items-center justify-center text-2xl", color)}>
            {glyph}
          </div>
        </>
      )}
    </motion.div>
  );
}
