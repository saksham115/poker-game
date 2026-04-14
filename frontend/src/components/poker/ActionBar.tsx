"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";

import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { formatChips } from "@/lib/utils";
import type { ClientAction, ValidAction } from "@/lib/types";

interface ActionBarProps {
  validActions: ValidAction[] | null;
  awaitingAction: boolean;
  heroStack: number;
  pot: number;
  onAction: (action: ClientAction) => void;
}

function parseRaise(valid: ValidAction[] | null): { min: number; max: number } | null {
  if (!valid) return null;
  const raise = valid[2];
  if (!raise || typeof raise.amount !== "object") return null;
  const { min, max } = raise.amount;
  if (min < 0) return null;
  return { min, max };
}

function callAmount(valid: ValidAction[] | null): number {
  if (!valid) return 0;
  const call = valid[1];
  if (!call || typeof call.amount !== "number") return 0;
  return call.amount;
}

export function ActionBar({
  validActions,
  awaitingAction,
  heroStack,
  pot,
  onAction,
}: ActionBarProps) {
  const raiseRange = useMemo(() => parseRaise(validActions), [validActions]);
  const toCall = callAmount(validActions);
  const [raiseAmount, setRaiseAmount] = useState(raiseRange?.min ?? 0);

  useEffect(() => {
    if (raiseRange) setRaiseAmount(raiseRange.min);
  }, [raiseRange?.min, raiseRange?.max]);

  const disabled = !awaitingAction || !validActions;
  const isCheck = toCall === 0;
  const canRaise = !!raiseRange;

  const quickBets: { label: string; amount: number }[] = [];
  if (canRaise && pot > 0) {
    const half = Math.max(raiseRange!.min, Math.min(raiseRange!.max, Math.floor(pot / 2)));
    const threeq = Math.max(raiseRange!.min, Math.min(raiseRange!.max, Math.floor((pot * 3) / 4)));
    const full = Math.max(raiseRange!.min, Math.min(raiseRange!.max, pot));
    const all = raiseRange!.max;
    quickBets.push({ label: "½ Pot", amount: half });
    quickBets.push({ label: "¾ Pot", amount: threeq });
    quickBets.push({ label: "Pot", amount: full });
    quickBets.push({ label: "All-In", amount: all });
  }

  return (
    <motion.div
      initial={{ y: 20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      className="relative shrink-0 rounded-2xl border border-border bg-surface/80 backdrop-blur-xl p-3 sm:p-4 shadow-2xl"
    >
      <div className="flex items-center justify-between mb-2 sm:mb-3 text-[11px] sm:text-xs uppercase tracking-wider">
        <span className="text-foreground/50">
          {disabled ? "Waiting for opponents…" : "Your turn"}
        </span>
        <span className="font-mono text-gold tabular-nums">
          Stack ${formatChips(heroStack)}
        </span>
      </div>

      {canRaise && (
        <div className="mb-2 sm:mb-3 space-y-1.5 sm:space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-foreground/60">Raise amount</span>
            <span className="font-mono text-gold font-semibold tabular-nums">
              ${formatChips(raiseAmount)}
            </span>
          </div>
          <Slider
            value={[raiseAmount]}
            min={raiseRange!.min}
            max={raiseRange!.max}
            step={Math.max(1, Math.floor((raiseRange!.max - raiseRange!.min) / 100))}
            onValueChange={(v) => setRaiseAmount(v[0])}
            disabled={disabled}
          />
          <div className="flex gap-1.5">
            {quickBets.map((b) => (
              <button
                key={b.label}
                disabled={disabled}
                onClick={() => setRaiseAmount(b.amount)}
                className="flex-1 min-h-11 sm:min-h-9 rounded-md border border-border bg-black/30 px-2 py-2 sm:py-1.5 text-[11px] font-medium text-foreground/70 transition hover:border-gold/40 hover:text-foreground disabled:opacity-40 disabled:pointer-events-none cursor-pointer"
              >
                {b.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-3 gap-2">
        <Button
          variant="fold"
          size="lg"
          disabled={disabled}
          onClick={() => onAction({ action: "fold" })}
        >
          Fold
        </Button>
        <Button
          variant="call"
          size="lg"
          disabled={disabled}
          onClick={() => onAction({ action: "call" })}
        >
          {isCheck ? "Check" : `Call ${toCall}`}
        </Button>
        <Button
          variant="raise"
          size="lg"
          disabled={disabled || !canRaise}
          onClick={() =>
            canRaise && onAction({ action: "raise", amount: raiseAmount })
          }
        >
          {canRaise ? `Raise ${raiseAmount}` : "Raise"}
        </Button>
      </div>
    </motion.div>
  );
}
