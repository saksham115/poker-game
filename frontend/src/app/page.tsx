"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { motion } from "framer-motion";
import { Play, Users, Coins, Hash } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";

export default function LandingPage() {
  const router = useRouter();
  const [heroName, setHeroName] = useState("You");
  const [numBots, setNumBots] = useState(3);
  const [initialStack, setInitialStack] = useState(1000);
  const [smallBlind, setSmallBlind] = useState(10);
  const [maxRounds, setMaxRounds] = useState(25);

  const start = () => {
    const params = new URLSearchParams({
      hero_name: heroName || "You",
      num_bots: String(numBots),
      initial_stack: String(initialStack),
      small_blind: String(smallBlind),
      max_rounds: String(maxRounds),
    });
    router.push(`/game?${params.toString()}`);
  };

  return (
    <main className="min-h-dvh flex items-center justify-center p-4 md:p-8">
      <div className="w-full max-w-5xl grid md:grid-cols-[1.1fr_1fr] gap-8 items-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="space-y-6 text-center md:text-left"
        >
          <div className="inline-flex items-center gap-2 rounded-full border border-gold/30 bg-black/40 px-3 py-1 text-xs font-medium uppercase tracking-widest text-gold">
            <span className="h-1.5 w-1.5 rounded-full bg-gold animate-pulse" />
            Powered by PyPokerEngine
          </div>
          <h1 className="text-5xl md:text-6xl font-bold leading-[0.95] tracking-tight">
            No-Limit
            <br />
            <span className="bg-gradient-to-br from-gold-soft via-gold to-gold-dark bg-clip-text text-transparent">
              Texas Hold&apos;em
            </span>
          </h1>
          <p className="text-foreground/60 text-base md:text-lg max-w-md mx-auto md:mx-0 leading-relaxed">
            Sit down at the felt against configurable AI bots. Real hands, real
            math, real chips — live-streamed over WebSocket.
          </p>
          <div className="flex flex-wrap justify-center md:justify-start gap-2 text-[11px]">
            {["Live WebSocket", "1–5 AI bots", "Multiple personalities", "Side-pot aware"].map(
              (tag) => (
                <span
                  key={tag}
                  className="rounded-full border border-border bg-surface/50 px-3 py-1 text-foreground/70"
                >
                  {tag}
                </span>
              )
            )}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
        >
          <Card>
            <CardHeader>
              <CardTitle className="text-xl">Configure table</CardTitle>
              <CardDescription>Set the game rules, then take a seat.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="hero_name">Display name</Label>
                <Input
                  id="hero_name"
                  value={heroName}
                  maxLength={20}
                  onChange={(e) => setHeroName(e.target.value)}
                  placeholder="Your name"
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="flex items-center gap-1.5">
                    <Users size={12} /> Number of bots
                  </Label>
                  <span className="font-mono text-gold font-semibold">{numBots}</span>
                </div>
                <Slider
                  value={[numBots]}
                  min={1}
                  max={5}
                  step={1}
                  onValueChange={(v) => setNumBots(v[0])}
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="flex items-center gap-1.5">
                    <Coins size={12} /> Starting stack
                  </Label>
                  <span className="font-mono text-gold font-semibold tabular-nums">
                    ${initialStack}
                  </span>
                </div>
                <Slider
                  value={[initialStack]}
                  min={100}
                  max={5000}
                  step={100}
                  onValueChange={(v) => setInitialStack(v[0])}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Small blind</Label>
                  <Input
                    type="number"
                    min={1}
                    max={1000}
                    value={smallBlind}
                    onChange={(e) => setSmallBlind(Math.max(1, Number(e.target.value) || 1))}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="flex items-center gap-1.5">
                    <Hash size={12} /> Rounds
                  </Label>
                  <Input
                    type="number"
                    min={1}
                    max={200}
                    value={maxRounds}
                    onChange={(e) => setMaxRounds(Math.max(1, Number(e.target.value) || 1))}
                  />
                </div>
              </div>

              <Button size="lg" className="w-full" onClick={start}>
                <Play size={16} /> Deal me in
              </Button>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </main>
  );
}
