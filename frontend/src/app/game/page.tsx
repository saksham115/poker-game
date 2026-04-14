"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, Trophy } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ActionBar } from "@/components/poker/ActionBar";
import { GameLog } from "@/components/poker/GameLog";
import { Table } from "@/components/poker/Table";
import { WinnerOverlay } from "@/components/poker/WinnerOverlay";
import { useGameSocket } from "@/hooks/useGameSocket";
import { formatChips } from "@/lib/utils";
import type { GameConfig } from "@/lib/types";

function GamePageInner() {
  const router = useRouter();
  const params = useSearchParams();

  const config = useMemo<GameConfig>(() => {
    return {
      hero_name: params.get("hero_name") ?? "You",
      num_bots: Number(params.get("num_bots") ?? 3),
      initial_stack: Number(params.get("initial_stack") ?? 1000),
      small_blind: Number(params.get("small_blind") ?? 10),
      max_rounds: Number(params.get("max_rounds") ?? 25),
    };
  }, [params]);

  const { state, sendAction } = useGameSocket({ config });

  const heroSeat = state.seats.find((s) => s.uuid === state.heroUuid);
  const winnerStrength =
    state.winners && state.handInfo
      ? state.handInfo.find((h) => h.uuid === state.winners![0].uuid)?.hand.hand.strength ?? null
      : null;

  return (
    <main className="min-h-dvh flex flex-col">
      <header className="flex items-center justify-between px-4 md:px-8 py-4 border-b border-border/50">
        <Button variant="ghost" size="sm" onClick={() => router.push("/")}>
          <ArrowLeft size={14} /> Leave table
        </Button>
        <div className="flex items-center gap-6 text-xs">
          <div>
            <div className="text-foreground/50 uppercase tracking-wider text-[10px]">
              Round
            </div>
            <div className="font-mono font-bold text-foreground tabular-nums">
              {state.currentRound || "–"}
              <span className="text-foreground/40"> / {state.totalRounds || config.max_rounds}</span>
            </div>
          </div>
          <div>
            <div className="text-foreground/50 uppercase tracking-wider text-[10px]">
              Blinds
            </div>
            <div className="font-mono font-bold text-foreground tabular-nums">
              {config.small_blind}/{config.small_blind * 2}
            </div>
          </div>
          <div>
            <div className="text-foreground/50 uppercase tracking-wider text-[10px]">
              Status
            </div>
            <div className="font-semibold text-gold capitalize">{state.status}</div>
          </div>
        </div>
      </header>

      <div className="flex-1 grid lg:grid-cols-[1fr_320px] gap-4 p-4 md:p-6">
        <div className="relative flex flex-col gap-4 min-h-0">
          <div className="relative flex-1 flex items-center justify-center">
            <Table
              seats={state.seats}
              heroUuid={state.heroUuid}
              holeCard={state.holeCard}
              community={state.community}
              pot={state.pot}
              dealerBtn={state.dealerBtn}
              activePlayerUuid={state.activePlayerUuid}
              winners={state.winners}
              handInfo={state.handInfo}
              roundState={state.roundState}
              revealedHoleCards={state.revealedHoleCards}
            />
            <WinnerOverlay
              winners={state.winners}
              pot={state.pot}
              handStrength={winnerStrength}
              visible={!!state.winners && state.status !== "ended"}
            />
            {state.status === "ended" && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="absolute inset-0 z-40 flex items-center justify-center bg-black/70 backdrop-blur"
              >
                <div className="rounded-2xl border border-gold/40 bg-surface px-8 py-6 text-center space-y-4 shadow-gold-glow">
                  <Trophy className="mx-auto text-gold" size={40} />
                  <div>
                    <div className="text-xs uppercase tracking-widest text-gold/70">
                      Final standings
                    </div>
                    <div className="mt-3 space-y-1">
                      {[...(state.finalStandings ?? [])]
                        .sort((a, b) => b.stack - a.stack)
                        .map((p, i) => (
                          <div
                            key={p.uuid}
                            className="flex items-center justify-between gap-6 text-sm font-mono tabular-nums"
                          >
                            <span className="text-foreground/80">
                              {i + 1}. {p.name}
                            </span>
                            <span className="font-bold text-gold">
                              ${formatChips(p.stack)}
                            </span>
                          </div>
                        ))}
                    </div>
                  </div>
                  <Button onClick={() => router.push("/")}>New game</Button>
                </div>
              </motion.div>
            )}
          </div>
          <ActionBar
            validActions={state.validActions}
            awaitingAction={state.awaitingAction && state.status === "live"}
            heroStack={heroSeat?.stack ?? 0}
            pot={state.pot}
            onAction={sendAction}
          />
        </div>
        <aside className="min-h-[300px] lg:min-h-0">
          <GameLog entries={state.log} />
        </aside>
      </div>
    </main>
  );
}

export default function GamePage() {
  return (
    <Suspense fallback={<div className="p-8 text-foreground/60">Loading…</div>}>
      <GamePageInner />
    </Suspense>
  );
}
