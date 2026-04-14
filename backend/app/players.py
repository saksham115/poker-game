import queue
import random
import time
from typing import Callable

from pypokerengine.players import BasePokerPlayer


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
    """Heuristic bot with per-style aggression profiles and a lightweight hand-strength proxy."""

    PROFILES = {
        "tight":      {"fold": 0.45, "raise": 0.88},
        "balanced":   {"fold": 0.28, "raise": 0.78},
        "aggressive": {"fold": 0.15, "raise": 0.58},
        "maniac":     {"fold": 0.05, "raise": 0.35},
    }

    def __init__(self, style: str = "balanced", think_delay: float = 1.8):
        super().__init__()
        self.style = style if style in self.PROFILES else "balanced"
        self.think_delay = max(0.0, think_delay)
        self.hole_card: list[str] = []

    def declare_action(self, valid_actions, hole_card, round_state):
        if self.think_delay > 0:
            jitter = random.uniform(-0.25, 0.35)
            time.sleep(max(0.2, self.think_delay + jitter))
        profile = self.PROFILES[self.style]
        call_amount = valid_actions[1]["amount"]
        raise_info = valid_actions[2]["amount"]
        pot = round_state["pot"]["main"]["amount"]

        strength = self._hand_strength(hole_card, round_state.get("community_card", []))
        roll = random.random() + (0.5 - strength) * 0.7

        if call_amount > 0 and roll < profile["fold"]:
            return "fold", 0
        if raise_info["min"] != -1 and roll > profile["raise"]:
            target = int(pot * (0.5 + strength * 0.4))
            bet = max(raise_info["min"], min(raise_info["max"], target or raise_info["min"]))
            return "raise", bet
        return "call", call_amount

    @staticmethod
    def _hand_strength(hole, community) -> float:
        ranks = "23456789TJQKA"

        def rank(card: str) -> int:
            return ranks.index(card[1])

        hole_vals = [rank(c) for c in hole]
        board_vals = [rank(c) for c in community]
        score = 0.0
        if hole_vals[0] == hole_vals[1]:
            score += 0.40 + hole_vals[0] * 0.025
        score += (max(hole_vals) / 12.0) * 0.25
        combined = hole_vals + board_vals
        if len(set(combined)) < len(combined):
            score += 0.20
        hole_suits = {c[0] for c in hole}
        board_suits = [c[0] for c in community]
        if len(hole_suits) == 1 and board_suits.count(next(iter(hole_suits))) >= 2:
            score += 0.10
        return min(score, 1.0)

    def receive_game_start_message(self, game_info): pass

    def receive_round_start_message(self, round_count, hole_card, seats):
        self.hole_card = list(hole_card)

    def receive_street_start_message(self, street, round_state): pass
    def receive_game_update_message(self, action, round_state): pass
    def receive_round_result_message(self, winners, hand_info, round_state): pass
