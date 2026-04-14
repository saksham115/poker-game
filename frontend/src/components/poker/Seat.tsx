"use client";

import { motion } from "framer-motion";
import { Crown, User } from "lucide-react";

import { PlayingCard } from "./PlayingCard";
import { cn, formatChips } from "@/lib/utils";
import type { Seat as SeatType } from "@/lib/types";

export interface SeatProps {
  seat: SeatType;
  isHero: boolean;
  isDealer: boolean;
  isActive: boolean;
  isWinner: boolean;
  holeCards?: string[];
  revealedCards?: string[];
  lastActionText?: string;
  handStrength?: string;
}

export function Seat({
  seat,
  isHero,
  isDealer,
  isActive,
  isWinner,
  holeCards,
  revealedCards,
  lastActionText,
  handStrength,
}: SeatProps) {
  const folded = seat.state === "folded";
  const allin = seat.state === "allin";
  const cardsToShow = revealedCards ?? (isHero ? holeCards : undefined);
  const showFaceDown = !cardsToShow && !folded;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3 }}
      className={cn(
        "flex flex-col items-center gap-1.5",
        folded && "opacity-45"
      )}
    >
      <div className="flex gap-1 h-[68px] items-end">
        {cardsToShow ? (
          <>
            <PlayingCard card={cardsToShow[0]} size="md" dim={folded} />
            <PlayingCard card={cardsToShow[1]} size="md" dim={folded} delay={0.05} />
          </>
        ) : showFaceDown ? (
          <>
            <PlayingCard faceDown size="md" />
            <PlayingCard faceDown size="md" delay={0.05} />
          </>
        ) : (
          <div className="h-[68px] w-[100px]" />
        )}
      </div>

      <motion.div
        animate={
          isActive
            ? { boxShadow: "0 0 0 2px #d4af37, 0 0 24px rgba(212,175,55,0.5)" }
            : isWinner
              ? { boxShadow: "0 0 0 2px #d4af37, 0 0 40px rgba(212,175,55,0.7)" }
              : { boxShadow: "0 0 0 1px rgba(255,255,255,0.08)" }
        }
        transition={{ duration: 0.3 }}
        className={cn(
          "relative flex items-center gap-2 rounded-full bg-black/70 px-3 py-1.5 backdrop-blur-sm min-w-[130px]",
          isActive && "bg-black/80"
        )}
      >
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-gold-soft to-gold-dark text-black">
          {isHero ? <User size={16} /> : <span className="text-xs font-bold">{seat.name[0]}</span>}
        </div>
        <div className="flex flex-col min-w-0">
          <div className="flex items-center gap-1">
            <span className="text-xs font-semibold truncate max-w-[80px]">
              {seat.name}
            </span>
            {isWinner && <Crown size={12} className="text-gold shrink-0" />}
          </div>
          <span className="text-[10px] font-mono text-foreground/70 tabular-nums">
            ${formatChips(seat.stack)}
          </span>
        </div>
        {isDealer && (
          <div className="absolute -right-1 -bottom-1 flex h-5 w-5 items-center justify-center rounded-full bg-white text-[10px] font-bold text-black shadow-md">
            D
          </div>
        )}
        {allin && (
          <span className="absolute -top-2 left-1/2 -translate-x-1/2 rounded-full bg-red-600 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide">
            All In
          </span>
        )}
      </motion.div>

      {(() => {
        const thinking = isActive && !isHero && !folded && !isWinner;
        const label = folded
          ? "Folded"
          : handStrength ?? (thinking ? "Thinking…" : lastActionText);
        if (!label) return null;
        return (
          <motion.div
            key={label}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className={cn(
              "text-[10px] font-medium uppercase tracking-wider",
              thinking ? "text-gold animate-pulse" : "text-gold/80"
            )}
          >
            {label}
          </motion.div>
        );
      })()}
    </motion.div>
  );
}
