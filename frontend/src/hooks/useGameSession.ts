"use client";

import { useCallback, useEffect, useReducer, useRef } from "react";

import type {
  ClientAction,
  GameConfig,
  LogEntry,
  RoundState,
  Seat,
  ServerEvent,
  ValidAction,
} from "@/lib/types";

// ---------------------------------------------------------------------------
// State + reducer (identical event shapes to the old WS backend)
// ---------------------------------------------------------------------------

interface HandInfoEntry {
  uuid: string;
  hand: {
    hole: { high: number; low: number };
    hand: { high: number; strength: string; low: number };
  };
}

export interface GameState {
  status: "idle" | "connecting" | "live" | "ended" | "error";
  heroUuid: string | null;
  seats: Seat[];
  roundState: RoundState | null;
  holeCard: string[];
  community: string[];
  pot: number;
  currentRound: number;
  totalRounds: number;
  awaitingAction: boolean;
  validActions: ValidAction[] | null;
  dealerBtn: number | null;
  street: string | null;
  activePlayerUuid: string | null;
  log: LogEntry[];
  winners: Seat[] | null;
  handInfo: HandInfoEntry[] | null;
  revealedHoleCards: Record<string, string[]>;
  lastAction: { player_uuid: string; action: string; amount: number } | null;
  finalStandings: Seat[] | null;
  errorMessage: string | null;
}

type Action =
  | { kind: "set_status"; value: GameState["status"] }
  | { kind: "apply_event"; event: ServerEvent }
  | { kind: "reset" }
  | { kind: "clear_awaiting" }
  | { kind: "error"; message: string };

const initialState: GameState = {
  status: "idle",
  heroUuid: null,
  seats: [],
  roundState: null,
  holeCard: [],
  community: [],
  pot: 0,
  currentRound: 0,
  totalRounds: 0,
  awaitingAction: false,
  validActions: null,
  dealerBtn: null,
  street: null,
  activePlayerUuid: null,
  log: [],
  winners: null,
  handInfo: null,
  revealedHoleCards: {},
  lastAction: null,
  finalStandings: null,
  errorMessage: null,
};

let logCounter = 0;
function logEntry(entry: Omit<LogEntry, "id">): LogEntry {
  logCounter += 1;
  return { ...entry, id: logCounter };
}

function actionVerb(action: string): string {
  const a = action.toLowerCase();
  if (a === "fold") return "folds";
  if (a === "call") return "calls";
  if (a === "raise") return "raises to";
  if (a === "bigblind") return "posts big blind";
  if (a === "smallblind") return "posts small blind";
  if (a === "ante") return "antes";
  return a;
}

function nameFor(seats: Seat[], uuid: string): string {
  return seats.find((s) => s.uuid === uuid)?.name ?? "?";
}

function reducer(state: GameState, action: Action): GameState {
  switch (action.kind) {
    case "reset":
      return { ...initialState };
    case "set_status":
      return { ...state, status: action.value };
    case "clear_awaiting":
      return { ...state, awaitingAction: false, validActions: null };
    case "error":
      return {
        ...state,
        status: "error",
        errorMessage: action.message,
        log: [
          ...state.log,
          logEntry({ kind: "system", text: `Error: ${action.message}` }),
        ].slice(-200),
      };
    case "apply_event": {
      const e = action.event;
      switch (e.type) {
        case "game_start": {
          return {
            ...state,
            status: "live",
            heroUuid: e.hero_uuid,
            seats: e.game_info.seats,
            totalRounds: e.game_info.rule.max_round,
            log: [
              ...state.log,
              logEntry({
                kind: "system",
                text: `Game started — ${e.game_info.player_num} players, ${e.game_info.rule.max_round} rounds.`,
              }),
            ],
          };
        }
        case "round_start": {
          return {
            ...state,
            currentRound: e.round_count,
            holeCard: e.hole_card,
            seats: e.seats,
            community: [],
            winners: null,
            handInfo: null,
            revealedHoleCards: {},
            lastAction: null,
            log: [
              ...state.log,
              logEntry({
                kind: "round",
                round: e.round_count,
                text: `— Round ${e.round_count} —`,
              }),
            ].slice(-200),
          };
        }
        case "street_start": {
          const rs = e.round_state;
          return {
            ...state,
            street: e.street,
            roundState: rs,
            seats: rs.seats,
            community: rs.community_card,
            pot: rs.pot.main.amount,
            dealerBtn: rs.dealer_btn,
            activePlayerUuid: rs.seats[rs.next_player]?.uuid ?? null,
            log: [
              ...state.log,
              logEntry({
                kind: "street",
                round: rs.round_count,
                text: `${e.street.toUpperCase()}${
                  rs.community_card.length
                    ? ` — [${rs.community_card.join(" ")}]`
                    : ""
                }`,
              }),
            ].slice(-200),
          };
        }
        case "ask_action": {
          return {
            ...state,
            heroUuid: e.hero_uuid,
            holeCard: e.hole_card,
            roundState: e.round_state,
            validActions: e.valid_actions,
            awaitingAction: true,
            seats: e.round_state.seats,
            community: e.round_state.community_card,
            pot: e.round_state.pot.main.amount,
            dealerBtn: e.round_state.dealer_btn,
            street: e.round_state.street,
            activePlayerUuid: e.hero_uuid,
          };
        }
        case "game_update": {
          const rs = e.round_state;
          const actingName = nameFor(rs.seats, e.action.player_uuid);
          return {
            ...state,
            roundState: rs,
            seats: rs.seats,
            community: rs.community_card,
            pot: rs.pot.main.amount,
            lastAction: e.action,
            activePlayerUuid: rs.seats[rs.next_player]?.uuid ?? null,
            log: [
              ...state.log,
              logEntry({
                kind: "action",
                round: rs.round_count,
                text: `${actingName} ${actionVerb(e.action.action)}${
                  e.action.amount > 0 ? ` ${e.action.amount}` : ""
                }`,
              }),
            ].slice(-200),
          };
        }
        case "round_result": {
          const names = e.winners.map((w) => w.name).join(", ");
          const isShowdown = (e.hand_info?.length ?? 0) > 1;
          const showdownUuids = new Set(
            isShowdown ? e.hand_info.map((h) => h.uuid) : []
          );
          const reveal: Record<string, string[]> = {};
          if (isShowdown && e.hole_cards) {
            for (const [uuid, cards] of Object.entries(e.hole_cards)) {
              if (showdownUuids.has(uuid)) reveal[uuid] = cards;
            }
          }
          return {
            ...state,
            winners: e.winners,
            handInfo: e.hand_info,
            revealedHoleCards: reveal,
            seats: e.round_state.seats,
            pot: e.round_state.pot.main.amount,
            roundState: e.round_state,
            awaitingAction: false,
            activePlayerUuid: null,
            log: [
              ...state.log,
              logEntry({
                kind: "winner",
                round: e.round_state.round_count,
                text: `Winner: ${names}`,
              }),
            ].slice(-200),
          };
        }
        case "game_end": {
          return {
            ...state,
            status: "ended",
            finalStandings: e.result.players,
            awaitingAction: false,
            log: [
              ...state.log,
              logEntry({ kind: "system", text: "Game over." }),
            ].slice(-200),
          };
        }
        default:
          return state;
      }
    }
    default:
      return state;
  }
}

// ---------------------------------------------------------------------------
// Transport: HTTP POST + client-side event pacing
// ---------------------------------------------------------------------------

interface ServerResponse {
  events: ServerEvent[];
  session: unknown;
  done: boolean;
}

interface UseGameSessionOptions {
  config: GameConfig | null;
  apiBase?: string;
  botThinkMs?: number;
  resultPauseMs?: number;
}

const DEFAULT_BOT_THINK_MS = 1800;
const DEFAULT_RESULT_PAUSE_MS = 4000;

/**
 * Delay applied between consecutive events as they flow into the reducer.
 * Most events chain instantly (street_start, round_start, ask_action), but
 * bot game_updates get a deliberate pause so the UI can show the "thinking →
 * acts" progression, and round_result gets a longer pause so the winner
 * overlay lingers before the next round_start wipes it.
 */
function delayForEvent(
  event: ServerEvent,
  heroUuid: string | null,
  botThinkMs: number,
  resultPauseMs: number
): number {
  if (event.type === "game_update") {
    if (event.action?.player_uuid && event.action.player_uuid !== heroUuid) {
      return botThinkMs;
    }
    return 120;
  }
  if (event.type === "round_result") return resultPauseMs;
  if (event.type === "ask_action") return 200;
  if (event.type === "street_start") return 500;
  if (event.type === "round_start") return 400;
  return 100;
}

export function useGameSession({
  config,
  apiBase = "",
  botThinkMs = DEFAULT_BOT_THINK_MS,
  resultPauseMs = DEFAULT_RESULT_PAUSE_MS,
}: UseGameSessionOptions) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const sessionRef = useRef<unknown>(null);
  const queueRef = useRef<ServerEvent[]>([]);
  const drainingRef = useRef(false);
  const cancelledRef = useRef(false);
  const pendingActionRef = useRef(false);
  const heroUuidRef = useRef<string | null>(null);

  const drain = useCallback(() => {
    if (drainingRef.current) return;
    drainingRef.current = true;

    const pump = () => {
      if (cancelledRef.current) {
        drainingRef.current = false;
        return;
      }
      const next = queueRef.current.shift();
      if (!next) {
        drainingRef.current = false;
        return;
      }
      if (next.type === "game_start") {
        heroUuidRef.current = next.hero_uuid;
      }
      dispatch({ kind: "apply_event", event: next });
      const delay = delayForEvent(
        next,
        heroUuidRef.current,
        botThinkMs,
        resultPauseMs
      );
      window.setTimeout(pump, delay);
    };

    window.setTimeout(pump, 0);
  }, [botThinkMs, resultPauseMs]);

  const enqueue = useCallback(
    (events: ServerEvent[]) => {
      queueRef.current.push(...events);
      drain();
    },
    [drain]
  );

  // Start the session whenever config arrives
  useEffect(() => {
    if (!config) return;
    cancelledRef.current = false;
    queueRef.current = [];
    drainingRef.current = false;
    pendingActionRef.current = false;
    heroUuidRef.current = null;
    sessionRef.current = null;
    dispatch({ kind: "reset" });
    dispatch({ kind: "set_status", value: "connecting" });

    let aborted = false;
    (async () => {
      try {
        const res = await fetch(`${apiBase}/api/game/start`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(config),
        });
        if (!res.ok) {
          const msg = await res.text();
          dispatch({ kind: "error", message: `start failed: ${msg}` });
          return;
        }
        const data = (await res.json()) as ServerResponse;
        if (aborted) return;
        sessionRef.current = data.session;
        enqueue(data.events);
      } catch (err) {
        if (aborted) return;
        dispatch({
          kind: "error",
          message: err instanceof Error ? err.message : String(err),
        });
      }
    })();

    return () => {
      aborted = true;
      cancelledRef.current = true;
      queueRef.current = [];
    };
  }, [config, apiBase, enqueue]);

  const sendAction = useCallback(
    async (payload: ClientAction) => {
      if (pendingActionRef.current) return;
      const session = sessionRef.current;
      if (!session) return;
      pendingActionRef.current = true;
      dispatch({ kind: "clear_awaiting" });
      try {
        const res = await fetch(`${apiBase}/api/game/action`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            session,
            action: payload.action,
            amount: payload.amount ?? 0,
          }),
        });
        if (!res.ok) {
          const msg = await res.text();
          dispatch({ kind: "error", message: `action failed: ${msg}` });
          return;
        }
        const data = (await res.json()) as ServerResponse;
        sessionRef.current = data.session;
        enqueue(data.events);
      } catch (err) {
        dispatch({
          kind: "error",
          message: err instanceof Error ? err.message : String(err),
        });
      } finally {
        pendingActionRef.current = false;
      }
    },
    [apiBase, enqueue]
  );

  return { state, sendAction };
}
