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
  | { kind: "append_log"; entry: Omit<LogEntry, "id"> };

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
    case "append_log":
      return { ...state, log: [...state.log, logEntry(action.entry)].slice(-200) };
    case "clear_awaiting":
      return { ...state, awaitingAction: false, validActions: null };
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
            awaitingAction:
              state.heroUuid === rs.seats[rs.next_player]?.uuid
                ? state.awaitingAction
                : false,
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
        case "error": {
          return {
            ...state,
            status: "error",
            errorMessage: e.message,
            log: [
              ...state.log,
              logEntry({ kind: "system", text: `Error: ${e.message}` }),
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

interface UseGameSocketOptions {
  config: GameConfig | null;
  wsUrl?: string;
}

export function useGameSocket({ config, wsUrl }: UseGameSocketOptions) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!config) return;

    dispatch({ kind: "reset" });
    dispatch({ kind: "set_status", value: "connecting" });

    const url =
      wsUrl ??
      process.env.NEXT_PUBLIC_WS_URL ??
      `ws://${typeof window !== "undefined" ? window.location.hostname : "localhost"}:8000/ws/game`;

    const ws = new WebSocket(url);
    socketRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: "start", config }));
    };
    ws.onmessage = (ev) => {
      try {
        const event: ServerEvent = JSON.parse(ev.data);
        dispatch({ kind: "apply_event", event });
      } catch {
        // ignore malformed
      }
    };
    ws.onerror = () => {
      dispatch({ kind: "set_status", value: "error" });
    };
    ws.onclose = () => {
      if (socketRef.current === ws) {
        socketRef.current = null;
      }
    };

    return () => {
      ws.close();
      socketRef.current = null;
    };
  }, [config, wsUrl]);

  const sendAction = useCallback((payload: ClientAction) => {
    const ws = socketRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: "action", payload }));
    dispatch({ kind: "clear_awaiting" });
  }, []);

  return { state, sendAction };
}
