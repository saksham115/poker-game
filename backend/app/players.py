import queue
import random
import time
from typing import Callable

from pypokerengine.players import BasePokerPlayer
from pypokerengine.utils.card_utils import estimate_hole_card_win_rate, gen_cards

RANKS = "23456789TJQKA"
TIERS = ("trash", "speculative", "playable", "strong", "premium")


def _rank_index(card: str) -> int:
    return RANKS.index(card[1])


def _hand_category(hole: list[str]) -> str:
    r1, r2 = _rank_index(hole[0]), _rank_index(hole[1])
    hi, lo = max(r1, r2), min(r1, r2)
    suited = hole[0][0] == hole[1][0]
    pair = r1 == r2
    a_idx = RANKS.index("A")
    k_idx = RANKS.index("K")
    q_idx = RANKS.index("Q")
    j_idx = RANKS.index("J")
    t_idx = RANKS.index("T")

    if pair:
        if hi >= t_idx:
            return "premium"
        if hi >= RANKS.index("7"):
            return "strong"
        return "speculative"

    if hi == a_idx:
        if lo == k_idx:
            return "premium"
        if lo == q_idx:
            return "strong"
        if lo == j_idx:
            return "strong" if suited else "playable"
        if lo == t_idx:
            return "playable"
        return "speculative" if suited else "trash"

    if hi == k_idx:
        if lo == q_idx:
            return "strong" if suited else "playable"
        if lo >= t_idx:
            return "playable"
        if suited and lo >= RANKS.index("9"):
            return "speculative"
        return "trash"

    if hi >= q_idx and lo >= t_idx:
        return "playable" if suited else "speculative"

    gap = hi - lo
    if suited:
        if gap <= 1 and hi >= RANKS.index("7"):
            return "speculative"
        if gap == 2 and hi >= RANKS.index("8"):
            return "speculative"
    return "trash"


def _position_bucket(round_state: dict, uuid: str) -> str:
    """Map the bot's seat to a coarse preflop position bucket."""
    seats = round_state["seats"]
    n = len(seats)
    btn = round_state["dealer_btn"]
    my_idx = next((i for i, s in enumerate(seats) if s["uuid"] == uuid), 0)
    dist = (my_idx - btn) % n
    if n == 2:
        return "LATE" if dist == 0 else "BB"
    if dist == 0:
        return "LATE"
    if dist == 1:
        return "SB"
    if dist == 2:
        return "BB"
    if dist == n - 1 and n >= 5:
        return "LATE"
    return "EARLY"


def _in_position_postflop(round_state: dict, uuid: str) -> bool:
    """True if the bot is the last remaining player to act on the current street."""
    seats = round_state["seats"]
    n = len(seats)
    btn = round_state["dealer_btn"]
    order: list[str] = []
    for k in range(1, n + 1):
        idx = (btn + k) % n
        seat = seats[idx]
        if seat["state"] in ("participating", "allin"):
            order.append(seat["uuid"])
    return bool(order) and order[-1] == uuid


def _was_preflop_aggressor(round_state: dict, uuid: str) -> bool:
    last_raiser = None
    for entry in round_state["action_histories"].get("preflop", []):
        if entry.get("action") == "RAISE":
            last_raiser = entry.get("uuid")
    return last_raiser == uuid


def _raises_this_street(round_state: dict, street: str) -> int:
    return sum(
        1
        for e in round_state["action_histories"].get(street, [])
        if e.get("action") == "RAISE"
    )


def _my_street_contribution(round_state: dict, uuid: str, street: str) -> int:
    latest = 0
    for entry in round_state["action_histories"].get(street, []):
        if entry.get("uuid") != uuid or entry.get("action") == "FOLD":
            continue
        latest = max(latest, entry.get("amount", 0) or 0)
    return latest


def _active_opponents(round_state: dict, uuid: str) -> int:
    return sum(
        1
        for s in round_state["seats"]
        if s["uuid"] != uuid and s["state"] in ("participating", "allin")
    )


def _equity(hole: list[str], community: list[str], nb_opponents: int, nb_sim: int) -> float:
    if nb_opponents <= 0:
        return 1.0
    return estimate_hole_card_win_rate(
        nb_simulation=nb_sim,
        nb_player=nb_opponents + 1,
        hole_card=gen_cards(hole),
        community_card=gen_cards(community) if community else [],
    )


def _clamp_raise(amount: int, raise_info: dict) -> int:
    return max(raise_info["min"], min(raise_info["max"], amount))


# Style tunes aggression on top of the solid baseline; it never injects random "bad" decisions.
STYLE_ADJUST = {
    "tight":      {"open_shift": -1, "cbet_freq": 0.45, "bluff_freq": 0.05, "value_factor": 0.60},
    "balanced":   {"open_shift": 0,  "cbet_freq": 0.60, "bluff_freq": 0.15, "value_factor": 0.75},
    "aggressive": {"open_shift": 1,  "cbet_freq": 0.75, "bluff_freq": 0.25, "value_factor": 0.85},
    "maniac":     {"open_shift": 2,  "cbet_freq": 0.85, "bluff_freq": 0.40, "value_factor": 1.00},
}

# Minimum tier (by index in TIERS) required to open from each position.
OPEN_THRESHOLDS = {
    "EARLY": 3,  # strong+
    "LATE": 2,   # playable+
    "SB": 3,     # strong+ (OOP the rest of the hand)
    "BB": 99,    # never "opens" — BB either checks or reacts to a raise
}


class HumanPlayer(BasePokerPlayer):
    """Blocks PyPokerEngine's game thread until an action is supplied via queue."""

    def __init__(
        self,
        action_queue: "queue.Queue[dict]",
        emit: Callable[[dict], None],
        result_pause: float = 3.5,
    ):
        super().__init__()
        self.action_queue = action_queue
        self.emit = emit
        self.result_pause = max(0.0, result_pause)

    def declare_action(self, valid_actions, hole_card, round_state):
        self.emit({
            "type": "ask_action",
            "hero_uuid": self.uuid,
            "valid_actions": valid_actions,
            "hole_card": hole_card,
            "round_state": round_state,
        })
        item = self.action_queue.get()
        action = item.get("action", "call")
        call_amount = valid_actions[1]["amount"]
        raise_info = valid_actions[2]["amount"]

        if action == "fold":
            return "fold", 0
        if action == "raise" and raise_info["min"] != -1:
            requested = int(item.get("amount", raise_info["min"]))
            clamped = max(raise_info["min"], min(raise_info["max"], requested))
            return "raise", clamped
        return "call", call_amount

    def receive_game_start_message(self, game_info):
        self.emit({"type": "game_start", "hero_uuid": self.uuid, "game_info": game_info})

    def receive_round_start_message(self, round_count, hole_card, seats):
        self.emit({
            "type": "round_start",
            "hero_uuid": self.uuid,
            "round_count": round_count,
            "hole_card": hole_card,
            "seats": seats,
        })

    def receive_street_start_message(self, street, round_state):
        self.emit({"type": "street_start", "street": street, "round_state": round_state})

    def receive_game_update_message(self, action, round_state):
        self.emit({"type": "game_update", "action": action, "round_state": round_state})

    def receive_round_result_message(self, winners, hand_info, round_state):
        self.emit({
            "type": "round_result",
            "winners": winners,
            "hand_info": hand_info,
            "round_state": round_state,
        })
        if self.result_pause > 0:
            time.sleep(self.result_pause)


class BotPlayer(BasePokerPlayer):
    """Regular-tier bot: preflop charts + Monte Carlo equity + pot odds + position + style modifiers."""

    def __init__(
        self,
        style: str = "balanced",
        think_delay: float = 1.8,
        nb_simulations: int = 1000,
    ):
        super().__init__()
        self.style = style if style in STYLE_ADJUST else "balanced"
        self.think_delay = max(0.0, think_delay)
        self.nb_simulations = nb_simulations

    def declare_action(self, valid_actions, hole_card, round_state):
        if self.think_delay > 0:
            jitter = random.uniform(-0.25, 0.35)
            time.sleep(max(0.2, self.think_delay + jitter))

        call_amount = valid_actions[1]["amount"]
        raise_info = valid_actions[2]["amount"]
        pot = round_state["pot"]["main"]["amount"]
        street = round_state["street"]
        style = STYLE_ADJUST[self.style]

        if street == "preflop":
            return self._decide_preflop(
                hole_card, round_state, call_amount, raise_info, style
            )
        return self._decide_postflop(
            hole_card, round_state, call_amount, raise_info, pot, street, style
        )

    def _decide_preflop(self, hole, round_state, call_amount, raise_info, style):
        category = _hand_category(hole)
        position = _position_bucket(round_state, self.uuid)
        raises = _raises_this_street(round_state, "preflop")
        sb_amount = round_state["small_blind_amount"]
        big_blind = sb_amount * 2
        can_raise = raise_info["min"] != -1

        tier_idx = TIERS.index(category)

        if raises == 0:
            effective_idx = min(len(TIERS) - 1, max(0, tier_idx + style["open_shift"]))
            threshold = OPEN_THRESHOLDS[position]
            if can_raise and effective_idx >= threshold:
                return "raise", _clamp_raise(big_blind * 3, raise_info)
            if call_amount == 0:
                return "call", 0
            return "fold", 0

        if raises == 1:
            if tier_idx >= TIERS.index("premium"):
                if can_raise:
                    return "raise", _clamp_raise(int(call_amount * 3), raise_info)
                return "call", call_amount
            if tier_idx == TIERS.index("strong"):
                if position in ("LATE", "BB"):
                    return "call", call_amount
                return "fold", 0
            if tier_idx == TIERS.index("playable"):
                if position == "BB":
                    return "call", call_amount
                return "fold", 0
            return "fold", 0

        # 3-bet or more: only premium survives
        if tier_idx >= TIERS.index("premium"):
            if can_raise and category == "premium" and random.random() < 0.3:
                return "raise", _clamp_raise(int(call_amount * 2.5), raise_info)
            return "call", call_amount
        return "fold", 0

    def _decide_postflop(self, hole, round_state, call_amount, raise_info, pot, street, style):
        community = round_state.get("community_card", [])
        nb_opp = _active_opponents(round_state, self.uuid)
        equity = _equity(hole, community, nb_opp, self.nb_simulations)

        my_contrib = _my_street_contribution(round_state, self.uuid, street)
        to_call = max(0, call_amount - my_contrib)
        pot_odds = to_call / (pot + to_call) if (pot + to_call) > 0 else 0.0

        can_raise = raise_info["min"] != -1
        can_check = to_call == 0
        in_position = _in_position_postflop(round_state, self.uuid)
        is_aggressor = _was_preflop_aggressor(round_state, self.uuid)

        def value_bet(factor: float) -> tuple[str, int]:
            target = max(1, int(pot * factor))
            return "raise", _clamp_raise(target, raise_info)

        # Very strong hands: bet big for value
        if can_raise and equity >= 0.78:
            return value_bet(style["value_factor"])
        # Strong hands: bet / c-bet
        if can_raise and equity >= 0.62 and (is_aggressor or in_position):
            return value_bet(0.66)
        # Decent equity: call if priced in, occasionally raise as aggressor
        if equity >= pot_odds + 0.03:
            if (
                can_raise
                and is_aggressor
                and street == "flop"
                and random.random() < style["cbet_freq"]
            ):
                return value_bet(0.55)
            return "call", call_amount
        # Weak hand, can check for free
        if can_check:
            return "call", 0
        # Weak hand facing a bet — occasional bluff c-bet in position
        if (
            can_raise
            and is_aggressor
            and in_position
            and street == "flop"
            and random.random() < style["bluff_freq"]
        ):
            return value_bet(0.5)
        return "fold", 0

    def receive_game_start_message(self, game_info): pass
    def receive_round_start_message(self, round_count, hole_card, seats): pass
    def receive_street_start_message(self, street, round_state): pass
    def receive_game_update_message(self, action, round_state): pass
    def receive_round_result_message(self, winners, hand_info, round_state): pass
