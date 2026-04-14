export type Street = "preflop" | "flop" | "turn" | "river" | "showdown";

export interface Seat {
  uuid: string;
  name: string;
  stack: number;
  state: "participating" | "folded" | "allin";
}

export interface ActionHistoryEntry {
  action: string;
  amount?: number;
  uuid?: string;
  add_amount?: number;
  paid?: number;
}

export interface Pot {
  main: { amount: number };
  side: { amount: number; eligibles: string[] }[];
}

export interface RoundState {
  round_count: number;
  dealer_btn: number;
  small_blind_pos: number;
  big_blind_pos: number;
  next_player: number;
  small_blind_amount: number;
  street: Street;
  community_card: string[];
  seats: Seat[];
  pot: Pot;
  action_histories: Record<string, ActionHistoryEntry[]>;
}

export interface ValidAction {
  action: "fold" | "call" | "raise";
  amount: number | { min: number; max: number };
}

export interface AskActionEvent {
  type: "ask_action";
  hero_uuid: string;
  valid_actions: ValidAction[];
  hole_card: string[];
  round_state: RoundState;
}

export interface GameStartEvent {
  type: "game_start";
  hero_uuid: string;
  game_info: {
    player_num: number;
    rule: {
      initial_stack: number;
      max_round: number;
      small_blind_amount: number;
      ante: number;
    };
    seats: Seat[];
  };
}

export interface RoundStartEvent {
  type: "round_start";
  hero_uuid: string;
  round_count: number;
  hole_card: string[];
  seats: Seat[];
}

export interface StreetStartEvent {
  type: "street_start";
  street: Street;
  round_state: RoundState;
}

export interface GameUpdateEvent {
  type: "game_update";
  action: { player_uuid: string; action: string; amount: number };
  round_state: RoundState;
}

export interface RoundResultEvent {
  type: "round_result";
  winners: Seat[];
  hand_info: {
    uuid: string;
    hand: {
      hole: { high: number; low: number };
      hand: { high: number; strength: string; low: number };
    };
  }[];
  round_state: RoundState;
  hole_cards?: Record<string, string[]>;
}

export interface GameEndEvent {
  type: "game_end";
  result: { rule: unknown; players: Seat[] };
}

export interface ErrorEvent {
  type: "error";
  message: string;
}

export type ServerEvent =
  | GameStartEvent
  | RoundStartEvent
  | StreetStartEvent
  | AskActionEvent
  | GameUpdateEvent
  | RoundResultEvent
  | GameEndEvent
  | ErrorEvent;

export interface ClientAction {
  action: "fold" | "call" | "raise";
  amount?: number;
}

export interface GameConfig {
  num_bots: number;
  initial_stack: number;
  small_blind: number;
  max_rounds: number;
  hero_name: string;
}

export interface LogEntry {
  id: number;
  kind: "info" | "action" | "street" | "round" | "winner" | "system";
  text: string;
  round?: number;
}
