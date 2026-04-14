"use client";

import { AnimatePresence, motion } from "framer-motion";

import { PlayingCard } from "./PlayingCard";
import { Seat } from "./Seat";
import { formatChips } from "@/lib/utils";
import type {
  RoundState,
  Seat as SeatType,
} from "@/lib/types";

interface HandInfoEntry {
  uuid: string;
  hand: {
    hole: { high: number; low: number };
    hand: { high: number; strength: string; low: number };
  };
}

export interface TableProps {
  seats: SeatType[];
  heroUuid: string | null;
  holeCard: string[];
  community: string[];
  pot: number;
  dealerBtn: number | null;
  activePlayerUuid: string | null;
  winners: SeatType[] | null;
  handInfo: HandInfoEntry[] | null;
  roundState: RoundState | null;
  revealedHoleCards: Record<string, string[]>;
}

function lastActionFor(roundState: RoundState | null, uuid: string) {
  if (!roundState) return undefined;
  for (const street of ["river", "turn", "flop", "preflop"] as const) {
    const history = roundState.action_histories[street];
    if (!history) continue;
    for (let i = history.length - 1; i >= 0; i--) {
      const entry = history[i];
      if (entry.uuid === uuid && !["ANTE", "SMALLBLIND", "BIGBLIND"].includes(entry.action)) {
        if (entry.action === "FOLD") return "Fold";
        if (entry.action === "CALL") return entry.amount ? `Call ${entry.amount}` : "Check";
        if (entry.action === "RAISE") return `Raise ${entry.amount}`;
        return entry.action;
      }
    }
  }
  return undefined;
}

function seatPosition(index: number, total: number): { left: string; top: string } {
  const heroIdx = 0;
  const rel = (index - heroIdx + total) % total;
  const positions: Record<number, { left: string; top: string }[]> = {
    2: [
      { left: "50%", top: "88%" },
      { left: "50%", top: "8%" },
    ],
    3: [
      { left: "50%", top: "88%" },
      { left: "10%", top: "28%" },
      { left: "90%", top: "28%" },
    ],
    4: [
      { left: "50%", top: "88%" },
      { left: "8%", top: "42%" },
      { left: "50%", top: "6%" },
      { left: "92%", top: "42%" },
    ],
    5: [
      { left: "50%", top: "88%" },
      { left: "8%", top: "55%" },
      { left: "22%", top: "10%" },
      { left: "78%", top: "10%" },
      { left: "92%", top: "55%" },
    ],
    6: [
      { left: "50%", top: "88%" },
      { left: "6%", top: "60%" },
      { left: "16%", top: "14%" },
      { left: "50%", top: "2%" },
      { left: "84%", top: "14%" },
      { left: "94%", top: "60%" },
    ],
  };
  const layout = positions[total] ?? positions[6];
  return layout[rel];
}

function strengthName(strength: string): string {
  return strength.toLowerCase().replace(/_/g, " ");
}

export function Table({
  seats,
  heroUuid,
  holeCard,
  community,
  pot,
  dealerBtn,
  activePlayerUuid,
  winners,
  handInfo,
  roundState,
  revealedHoleCards,
}: TableProps) {
  const heroIndex = heroUuid ? seats.findIndex((s) => s.uuid === heroUuid) : -1;
  const winnerUuids = new Set((winners ?? []).map((w) => w.uuid));
  const handByUuid = new Map<string, HandInfoEntry>();
  (handInfo ?? []).forEach((h) => handByUuid.set(h.uuid, h));

  return (
    <div className="relative w-full h-full flex items-center justify-center">
      <div className="relative poker-table-fit">
        <div className="felt-surface absolute inset-[8%] rounded-[50%]" />
        <div className="absolute inset-[10%] rounded-[50%] border border-gold/15 pointer-events-none" />

        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 pointer-events-none z-10">
          <div className="flex flex-col items-center gap-1">
            <div className="text-[10px] uppercase tracking-widest text-gold/70">
              Pot
            </div>
            <motion.div
              key={pot}
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="flex items-center gap-2 rounded-full bg-black/50 px-4 py-1.5 backdrop-blur border border-gold/20"
            >
              <div className="h-3 w-3 rounded-full chip-stack" />
              <span className="font-mono font-bold text-gold tabular-nums text-base">
                ${formatChips(pot)}
              </span>
            </motion.div>
          </div>
          <div className="flex gap-1 sm:gap-1.5">
            <AnimatePresence>
              {community.map((card, i) => (
                <PlayingCard
                  key={`${card}-${i}`}
                  card={card}
                  size="lg"
                  delay={i * 0.08}
                />
              ))}
              {Array.from({ length: 5 - community.length }).map((_, i) => (
                <div
                  key={`empty-${i}`}
                  className="h-16 w-11 sm:h-24 sm:w-16 rounded-md border border-white/5 bg-black/20"
                />
              ))}
            </AnimatePresence>
          </div>
        </div>

        {seats.map((seat, idx) => {
          const rel = heroIndex >= 0 ? (idx - heroIndex + seats.length) % seats.length : idx;
          const pos = seatPosition(rel, seats.length);
          const isHero = seat.uuid === heroUuid;
          const isDealer = dealerBtn !== null && seats[dealerBtn]?.uuid === seat.uuid;
          const isActive = seat.uuid === activePlayerUuid && seat.state !== "folded";
          const isWinner = winnerUuids.has(seat.uuid);
          const hand = handByUuid.get(seat.uuid);
          const revealed =
            !isHero && revealedHoleCards[seat.uuid]?.length
              ? revealedHoleCards[seat.uuid]
              : undefined;
          return (
            <div
              key={seat.uuid}
              className="absolute -translate-x-1/2 -translate-y-1/2 z-20"
              style={{ left: pos.left, top: pos.top }}
            >
              <Seat
                seat={seat}
                isHero={isHero}
                isDealer={isDealer}
                isActive={isActive}
                isWinner={isWinner}
                holeCards={isHero ? holeCard : undefined}
                revealedCards={revealed}
                lastActionText={lastActionFor(roundState, seat.uuid)}
                handStrength={
                  isWinner && hand ? strengthName(hand.hand.hand.strength) : undefined
                }
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
