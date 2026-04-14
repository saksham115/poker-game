import asyncio
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import ValidationError

from .schemas import GameConfig
from .session import GameSession


app = FastAPI(title="PyPoker Web Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health():
    return {"ok": True}


@app.websocket("/ws/game")
async def ws_game(websocket: WebSocket):
    await websocket.accept()
    session: GameSession | None = None
    try:
        raw = await websocket.receive_text()
        try:
            msg = json.loads(raw)
        except json.JSONDecodeError:
            await websocket.send_json({"type": "error", "message": "invalid json"})
            return
        if msg.get("type") != "start":
            await websocket.send_json({"type": "error", "message": "expected type=start"})
            return
        try:
            cfg = GameConfig(**msg.get("config", {}))
        except ValidationError as exc:
            await websocket.send_json({"type": "error", "message": exc.errors()})
            return

        loop = asyncio.get_running_loop()
        session = GameSession(cfg, loop)
        session.start()

        async def push_events():
            while True:
                event = await session.events.get()
                if event.get("type") == "__sentinel__":
                    return
                await websocket.send_json(event)
                if event.get("type") in ("game_end", "error"):
                    return

        async def pump_actions():
            while True:
                text = await websocket.receive_text()
                try:
                    m = json.loads(text)
                except json.JSONDecodeError:
                    continue
                if m.get("type") == "action":
                    session.submit_action(m.get("payload", {}))

        sender = asyncio.create_task(push_events())
        receiver = asyncio.create_task(pump_actions())
        done, pending = await asyncio.wait(
            [sender, receiver], return_when=asyncio.FIRST_COMPLETED
        )
        for task in pending:
            task.cancel()
        for task in done:
            exc = task.exception()
            if exc and not isinstance(exc, WebSocketDisconnect):
                raise exc
    except WebSocketDisconnect:
        pass
    finally:
        if session is not None:
            session.stop()
