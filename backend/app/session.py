import asyncio
import queue
import threading
from typing import Optional

from pypokerengine.api.game import setup_config, start_poker

from .players import BotPlayer, HumanPlayer
from .schemas import GameConfig


BOT_NAMES = ["Aria", "Bjorn", "Chen", "Dali", "Elena"]
BOT_STYLES = ["tight", "aggressive", "balanced", "maniac", "balanced"]


class GameSession:
    """Runs a PyPokerEngine game in a worker thread and bridges it to asyncio."""

    def __init__(self, cfg: GameConfig, loop: asyncio.AbstractEventLoop):
        self.cfg = cfg
        self.loop = loop
        self.events: asyncio.Queue = asyncio.Queue()
        self.actions: "queue.Queue[dict]" = queue.Queue()
        self._thread: Optional[threading.Thread] = None
        self._done = False
        self._bots: list[BotPlayer] = []

    def _push(self, event: dict) -> None:
        self.loop.call_soon_threadsafe(self.events.put_nowait, event)

    def _emit(self, event: dict) -> None:
        if event.get("type") == "round_result" and self._bots:
            enriched = dict(event)
            enriched["hole_cards"] = {
                bot.uuid: list(bot.hole_card)
                for bot in self._bots
                if getattr(bot, "uuid", None) and bot.hole_card
            }
            self._push(enriched)
            return
        self._push(event)

    def start(self) -> None:
        human = HumanPlayer(self.actions, self._emit)
        config = setup_config(
            max_round=self.cfg.max_rounds,
            initial_stack=self.cfg.initial_stack,
            small_blind_amount=self.cfg.small_blind,
        )
        config.register_player(name=self.cfg.hero_name, algorithm=human)
        think_delay = self.cfg.bot_think_ms / 1000.0
        self._bots = []
        for i in range(self.cfg.num_bots):
            bot = BotPlayer(
                style=BOT_STYLES[i % len(BOT_STYLES)],
                think_delay=think_delay,
            )
            config.register_player(
                name=BOT_NAMES[i % len(BOT_NAMES)],
                algorithm=bot,
            )
            self._bots.append(bot)

        def run():
            try:
                result = start_poker(config, verbose=0)
                self._emit({"type": "game_end", "result": result})
            except Exception as exc:
                self._emit({"type": "error", "message": str(exc)})
            finally:
                self._done = True
                self._emit({"type": "__sentinel__"})

        self._thread = threading.Thread(target=run, daemon=True)
        self._thread.start()

    def submit_action(self, action: dict) -> None:
        self.actions.put(action)

    def stop(self) -> None:
        if not self._done:
            self.actions.put({"action": "fold", "amount": 0})
