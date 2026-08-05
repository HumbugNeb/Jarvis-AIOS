"""Publisher side of the Agent -> HUD render contract.

JARVIS's screen tools publish JSON over the shared LiveKit data channel (topic
"AIOS"). RENDER_TYPES must stay byte-identical to web/lib/contract.ts.
"""

from __future__ import annotations

import json
import time

RENDER_TYPES = ("chart", "stat", "list", "card", "clear")
DATA_TOPIC = "AIOS"
SCHEMA_VERSION = 1


async def publish_render(room, render_type: str, payload: dict) -> None:
    if render_type not in RENDER_TYPES:
        raise ValueError(f"render_type {render_type!r} not in contract {RENDER_TYPES}")
    message = {
        "v": SCHEMA_VERSION,
        "render_type": render_type,
        "ts": int(time.time() * 1000),
        "payload": payload,
    }
    data = json.dumps(message, separators=(",", ":")).encode("utf-8")
    await room.local_participant.publish_data(data, reliable=True, topic=DATA_TOPIC)
