"""
Vercel serverless FastAPI for PyPoker.

Stateless: the client holds the serialized game state between calls. Each
request rehydrates the engine state, applies the hero's action, walks through
all subsequent bot actions until the next hero turn (or the game ends), and
returns the accumulated events + new state blob.

Bot "thinking" delays live on the client — the server never sleeps, so a full
turn fits comfortably inside Vercel Hobby's 10s function budget.
"""

from __future__ import annotations

import random
import uuid as _uuid
from typing import Any, Dict, List, Optional, Tuple

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from pypokerengine.api.emulator import (
    Emulator,
    exclude_short_of_money_players,
    update_blind_level,
)
from pypokerengine.engine.message_builder import MessageBuilder
from pypokerengine.engine.poker_constants import PokerConstants as Const
from pypokerengine.engine.round_manager import RoundManager
from pypokerengine.engine.table import Table
from pypokerengine.players import BasePokerPlayer
from pypokerengine.utils.game_state_utils import deepcopy_game_state


app = FastAPI(title="PyPoker Serverless API")


BOT_NAMES = ["Aria", "Bjorn", "Chen", "Dali", "Elena"]
BOT_STYLES = ["tight", "aggressive", "balanced", "maniac", "balanced"]


# ---------------------------------------------------------------------------
# Bot logic (mirrors backend/app/players.py, minus the time.sleep)
# ---------------------------------------------------------------------------


class BotPlayer(BasePokerPlayer):
    PROFILES = {
        "tight":      {"fold": 0.45, "raise": 0.88},
        "balanced":   {"fold": 0.28, "raise": 0.78},
        "aggressive": {"fold": 0.15, "raise": 0.58},
        "maniac":     {"fold": 0.05, "raise": 0.35},
    }

    def __init__(self, style: str = "balanced"):
        super().__init__()
        self.style = style if style in self.PROFILES else "balanced"

    def declare_action(self, valid_actions, hole_card, round_state):
        profile = self.PROFILES[self.style]
        call_amount = valid_actions[1]["amount"]
        raise_info = valid_actions[2]["amount"]
        pot = round_state["pot"]["main"]["amount"]
        strength = self._strength(hole_card, round_state.get("community_card", []))
        roll = random.random() + (0.5 - strength) * 0.7
        if call_amount > 0 and roll < profile["fold"]:
            return "fold", 0
        if raise_info["min"] != -1 and roll > profile["raise"]:
            target = int(pot * (0.5 + strength * 0.4))
            bet = max(raise_info["min"], min(raise_info["max"], target or raise_info["min"]))
            return "raise", bet
        return "call", call_amount

    @staticmethod
    def _strength(hole, community):
        ranks = "23456789TJQKA"

        def r(c: str) -> int:
            return ranks.index(c[1])

        hv = [r(c) for c in hole]
        bv = [r(c) for c in community]
        score = 0.0
        if hv[0] == hv[1]:
            score += 0.40 + hv[0] * 0.025
        score += (max(hv) / 12.0) * 0.25
        combined = hv + bv
        if len(set(combined)) < len(combined):
            score += 0.20
        hs = {c[0] for c in hole}
        bs_letters = [c[0] for c in community]
        if len(hs) == 1 and bs_letters.count(next(iter(hs))) >= 2:
            score += 0.10
        return min(score, 1.0)

    # BasePokerPlayer requires these but we don't use them in this flow
    def receive_game_start_message(self, game_info): pass
    def receive_round_start_message(self, round_count, hole_card, seats): pass
    def receive_street_start_message(self, street, round_state): pass
    def receive_game_update_message(self, action, round_state): pass
    def receive_round_result_message(self, winners, hand_info, round_state): pass


# ---------------------------------------------------------------------------
# Request / response schemas
# ---------------------------------------------------------------------------


class StartRequest(BaseModel):
    num_bots: int = Field(default=3, ge=1, le=5)
    initial_stack: int = Field(default=1000, ge=20, le=100000)
    small_blind: int = Field(default=10, ge=1, le=1000)
    max_rounds: int = Field(default=25, ge=1, le=200)
    hero_name: str = Field(default="You", max_length=24)


class ActionRequest(BaseModel):
    session: Dict[str, Any]
    action: str
    amount: int = 0


# ---------------------------------------------------------------------------
# State serialization (JSON ⇄ engine state)
# ---------------------------------------------------------------------------


def _serialize_state(state: dict) -> dict:
    return {
        "round_count": state["round_count"],
        "small_blind_amount": state["small_blind_amount"],
        "street": state["street"],
        "next_player": state["next_player"],
        "table": state["table"].serialize(),
    }


def _deserialize_state(data: dict) -> dict:
    return {
        "round_count": data["round_count"],
        "small_blind_amount": data["small_blind_amount"],
        "street": data["street"],
        "next_player": data["next_player"],
        "table": Table.deserialize(data["table"]),
    }


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _new_uuid() -> str:
    return _uuid.uuid4().hex[:22]


def _bot_holes_snapshot(state: dict, hero_uuid: str) -> Dict[str, List[str]]:
    return {
        p.uuid: [str(c) for c in p.hole_card]
        for p in state["table"].seats.players
        if p.uuid != hero_uuid and p.hole_card
    }


def _collect_events(
    messages: list,
    hero_uuid: str,
    bot_holes: Dict[str, List[str]],
) -> List[dict]:
    """Convert raw engine messages into the wire format the frontend already
    understands (matches the event shapes emitted by the old WebSocket backend).
    """
    events: List[dict] = []
    seen_round_start = False
    for dest_uuid, wrapper in messages:
        msg = wrapper["message"]
        t = msg["message_type"]

        if t == "round_start_message":
            # RoundManager emits one per player. Keep only the hero's (so we
            # get his hole cards in the payload).
            if dest_uuid == hero_uuid and not seen_round_start:
                seen_round_start = True
                events.append({
                    "type": "round_start",
                    "round_count": msg["round_count"],
                    "hole_card": msg["hole_card"],
                    "seats": msg["seats"],
                    "hero_uuid": hero_uuid,
                })

        elif t == "street_start_message":
            events.append({
                "type": "street_start",
                "street": msg["street"],
                "round_state": msg["round_state"],
            })

        elif t == "game_update_message":
            events.append({
                "type": "game_update",
                "action": msg["action"],
                "round_state": msg["round_state"],
            })

        elif t == "round_result_message":
            events.append({
                "type": "round_result",
                "winners": msg["winners"],
                "hand_info": msg["hand_info"],
                "round_state": msg["round_state"],
                "hole_cards": bot_holes,
            })

        elif t == "game_result_message":
            events.append({
                "type": "game_end",
                "result": {
                    "rule": msg["game_information"]["rule"],
                    "players": msg["game_information"]["seats"],
                },
            })

    return events


def _is_game_finished(state: dict, game_rule: dict) -> bool:
    is_round_finished = state["street"] == Const.Street.FINISHED
    is_final_round = state["round_count"] == game_rule["max_round"]
    is_winner_decided = len([1 for p in state["table"].seats.players if p.stack != 0]) == 1
    return is_round_finished and (is_final_round or is_winner_decided)


def _start_new_round_raw(
    state: dict, game_rule: dict, blind_structure: dict
) -> Tuple[dict, list]:
    """Mirror of Emulator.start_new_round that returns the *raw* messages
    instead of the filtered event list (so we can emit round_start events that
    the Emulator drops)."""
    round_count = state["round_count"] + 1
    ante = game_rule["ante"]
    sb = game_rule["sb_amount"]
    deep = deepcopy_game_state(state)
    table = deep["table"]
    table.shift_dealer_btn()
    ante, sb = update_blind_level(ante, sb, round_count, blind_structure)
    table = exclude_short_of_money_players(table, ante, sb)

    if len([p for p in table.seats.players if p.is_active()]) == 1:
        msg = MessageBuilder.build_game_result_message(
            {
                "initial_stack": None,
                "max_round": None,
                "small_blind_amount": None,
                "ante": None,
                "blind_structure": None,
            },
            table.seats,
        )
        return deep, [("-1", msg)]

    new_state, messages = RoundManager.start_new_round(round_count, sb, ante, table)
    return new_state, messages


def _ask_message(state: dict, pos: int) -> dict:
    return MessageBuilder.build_ask_message(pos, state)["message"]


def _progress(
    state: dict,
    hero_uuid: str,
    bots: Dict[str, BotPlayer],
    game_rule: dict,
    blind_structure: dict,
    pending_action: Optional[str] = None,
    pending_amount: int = 0,
) -> Tuple[dict, List[dict], bool]:
    """Advance the game until it's the hero's turn again or the game ends.

    Returns (new_state, events, game_over).
    """
    events: List[dict] = []
    bot_holes = _bot_holes_snapshot(state, hero_uuid)

    if pending_action is not None:
        new_state, msgs = RoundManager.apply_action(state, pending_action, pending_amount)
        events += _collect_events(msgs, hero_uuid, bot_holes)
        state = new_state

    while True:
        if state["street"] == Const.Street.FINISHED:
            if _is_game_finished(state, game_rule):
                events.append(_build_game_end(state, game_rule))
                return state, events, True

            new_state, msgs = _start_new_round_raw(state, game_rule, blind_structure)
            bot_holes = _bot_holes_snapshot(new_state, hero_uuid)
            new_events = _collect_events(msgs, hero_uuid, bot_holes)
            events += new_events
            state = new_state
            if any(e.get("type") == "game_end" for e in new_events):
                return state, events, True
            continue

        next_pos = state["next_player"]
        if next_pos is None or next_pos == "not_found":
            return state, events, False

        next_uuid = state["table"].seats.players[next_pos].uuid

        if next_uuid == hero_uuid:
            ask = _ask_message(state, next_pos)
            events.append({
                "type": "ask_action",
                "hero_uuid": hero_uuid,
                "valid_actions": ask["valid_actions"],
                "hole_card": ask["hole_card"],
                "round_state": ask["round_state"],
            })
            return state, events, False

        bot = bots[next_uuid]
        ask = _ask_message(state, next_pos)
        bot_action, bot_amount = bot.declare_action(
            ask["valid_actions"], ask["hole_card"], ask["round_state"]
        )
        new_state, msgs = RoundManager.apply_action(state, bot_action, bot_amount)
        events += _collect_events(msgs, hero_uuid, bot_holes)
        state = new_state


def _build_game_end(state: dict, game_rule: dict) -> dict:
    return {
        "type": "game_end",
        "result": {
            "rule": {
                "max_round": game_rule["max_round"],
                "small_blind_amount": game_rule["sb_amount"],
                "ante": game_rule["ante"],
                "blind_structure": {},
            },
            "players": [
                {
                    "uuid": p.uuid,
                    "name": p.name,
                    "stack": p.stack,
                    "state": "folded" if not p.is_active() else "participating",
                }
                for p in state["table"].seats.players
            ],
        },
    }


def _build_bots(bot_infos: List[dict]) -> Dict[str, BotPlayer]:
    return {info["uuid"]: BotPlayer(style=info["style"]) for info in bot_infos}


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@app.get("/health")
@app.get("/api/health")
def health():
    return {"ok": True}


@app.post("/api/game/start")
def start_game(req: StartRequest):
    num_players = 1 + req.num_bots
    game_rule = {
        "player_num": num_players,
        "max_round": req.max_rounds,
        "sb_amount": req.small_blind,
        "ante": 0,
    }
    blind_structure: dict = {}

    hero_uuid = _new_uuid()
    hero_info = {"uuid": hero_uuid, "name": req.hero_name[:24] or "You", "style": None}
    bot_infos = [
        {
            "uuid": _new_uuid(),
            "name": BOT_NAMES[i % len(BOT_NAMES)],
            "style": BOT_STYLES[i % len(BOT_STYLES)],
        }
        for i in range(req.num_bots)
    ]

    emulator = Emulator()
    emulator.set_game_rule(num_players, req.max_rounds, req.small_blind, 0)
    ordered = [hero_info] + bot_infos
    players_info = {
        info["uuid"]: {"name": info["name"], "stack": req.initial_stack}
        for info in ordered
    }
    state = emulator.generate_initial_game_state(players_info)

    # Synthesize the leading game_start event before the first round kicks off
    events: List[dict] = [{
        "type": "game_start",
        "hero_uuid": hero_uuid,
        "game_info": {
            "player_num": num_players,
            "rule": {
                "initial_stack": req.initial_stack,
                "max_round": req.max_rounds,
                "small_blind_amount": req.small_blind,
                "ante": 0,
                "blind_structure": {},
            },
            "seats": [
                {
                    "uuid": info["uuid"],
                    "name": info["name"],
                    "stack": req.initial_stack,
                    "state": "participating",
                }
                for info in ordered
            ],
        },
    }]

    # Start round 1
    new_state, msgs = _start_new_round_raw(state, game_rule, blind_structure)
    bot_holes = _bot_holes_snapshot(new_state, hero_uuid)
    events += _collect_events(msgs, hero_uuid, bot_holes)
    state = new_state

    # Progress bot turns until hero's first ask or game ends
    bots = _build_bots(bot_infos)
    state, more_events, done = _progress(
        state, hero_uuid, bots, game_rule, blind_structure
    )
    events += more_events

    session = {
        "state": _serialize_state(state),
        "hero_uuid": hero_uuid,
        "bot_info": bot_infos,
        "game_rule": game_rule,
        "blind_structure": blind_structure,
        "initial_stack": req.initial_stack,
    }
    return {"events": events, "session": session, "done": done}


@app.post("/api/game/action")
def action_endpoint(req: ActionRequest):
    try:
        session = req.session
        hero_uuid: str = session["hero_uuid"]
        state = _deserialize_state(session["state"])
        game_rule = session["game_rule"]
        blind_structure = session.get("blind_structure", {})
        bots = _build_bots(session["bot_info"])
    except (KeyError, TypeError) as exc:
        raise HTTPException(status_code=400, detail=f"bad session: {exc}") from exc

    next_pos = state["next_player"]
    if next_pos is None or next_pos == "not_found":
        raise HTTPException(status_code=400, detail="no pending action")
    if state["table"].seats.players[next_pos].uuid != hero_uuid:
        raise HTTPException(status_code=400, detail="not hero's turn")

    ask = _ask_message(state, next_pos)
    valid = ask["valid_actions"]

    action_str = req.action
    amount = 0
    if action_str == "fold":
        amount = 0
    elif action_str == "call":
        amount = valid[1]["amount"]
    elif action_str == "raise":
        raise_info = valid[2]["amount"]
        if raise_info["min"] == -1:
            action_str = "call"
            amount = valid[1]["amount"]
        else:
            amount = max(raise_info["min"], min(raise_info["max"], int(req.amount)))
    else:
        raise HTTPException(status_code=400, detail=f"invalid action {action_str}")

    state, events, done = _progress(
        state,
        hero_uuid,
        bots,
        game_rule,
        blind_structure,
        pending_action=action_str,
        pending_amount=amount,
    )

    session_out = {
        **session,
        "state": _serialize_state(state),
    }
    return {"events": events, "session": session_out, "done": done}
