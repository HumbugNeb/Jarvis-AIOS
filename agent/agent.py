"""JARVIS — a general voice agent (Gemini 3.1 Flash Live) that can also paint the HUD.

The conversation loop lives inside Gemini: it hears you, thinks, and speaks back.
On top of that, JARVIS has four general "screen" tools — chart / stats / list / card —
so it can show data for ANY topic on the operator's HUD, in sync with its voice.

Run (after filling .env):
    python agent.py dev
"""

from __future__ import annotations

import logging
import os

from dotenv import load_dotenv
from livekit import agents
from livekit.agents import Agent, AgentSession, RoomInputOptions, RunContext, function_tool
from livekit.plugins import google

from prompts import SYSTEM_INSTRUCTION
from render import publish_render

load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env"))
logger = logging.getLogger("jarvis")

GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-3.1-flash-live-preview")
GEMINI_VOICE = os.getenv("GEMINI_VOICE", "Charon")


class Jarvis(Agent):
    """General assistant + four screen tools. Each tool paints the HUD in sync with speech."""

    def __init__(self, room) -> None:
        super().__init__(instructions=SYSTEM_INSTRUCTION)
        self._room = room  # the shared LiveKit room (the HUD is in here too)

    @function_tool()
    async def show_chart(self, context: RunContext, title: str, labels: list[str],
                         values: list[float], unit: str = "") -> str:
        """Draw a line chart on the operator's screen. Use when numbers over categories or
        time make a point (trends, comparisons, growth). `labels` and `values` must be the
        same length."""
        await publish_render(self._room, "chart", {"title": title, "labels": labels, "values": values, "unit": unit})
        return "Chart is on screen."

    @function_tool()
    async def show_stats(self, context: RunContext, title: str, labels: list[str],
                         values: list[str]) -> str:
        """Show key figures as stat cards (quick facts, KPIs, headline numbers). `labels`
        and `values` are parallel lists of equal length."""
        await publish_render(self._room, "stat", {"title": title, "labels": labels, "values": values})
        return "Stats are on screen."

    @function_tool()
    async def show_list(self, context: RunContext, title: str, items: list[str]) -> str:
        """Show a titled bullet list on screen (steps, options, names, a ranking)."""
        await publish_render(self._room, "list", {"title": title, "items": items})
        return "List is on screen."

    @function_tool()
    async def show_card(self, context: RunContext, title: str, body: str) -> str:
        """Show a text card on screen (a definition, summary, snippet, or note)."""
        await publish_render(self._room, "card", {"title": title, "body": body})
        return "Card is on screen."

    @function_tool()
    async def clear_screen(self, context: RunContext) -> str:
        """Remove every panel from the operator's screen (reset it to empty). Use when the
        operator asks to clear, reset, or wipe the screen / graphs."""
        await publish_render(self._room, "clear", {})
        return "Screen cleared."


async def entrypoint(ctx: agents.JobContext) -> None:
    await ctx.connect()
    logger.info("JARVIS joining room %s with %s / voice %s", ctx.room.name, GEMINI_MODEL, GEMINI_VOICE)

    session = AgentSession(
        llm=google.beta.realtime.RealtimeModel(
            model=GEMINI_MODEL,
            voice=GEMINI_VOICE,
            temperature=0.8,
        ),
    )
    await session.start(
        room=ctx.room,
        agent=Jarvis(ctx.room),
        room_input_options=RoomInputOptions(video_enabled=True),  # let Gemini see the camera
    )
    # gemini-3.1-flash-live-preview doesn't support generate_reply(); JARVIS speaks first
    # only when the operator does.

    # Fast recovery: the moment the operator leaves, end the job so the agent leaves the
    # room immediately. Otherwise it lingers ~2 min and a quick reconnect lands in a room
    # that still has the old (closed) agent — looking "Listening" with no reply.
    @ctx.room.on("participant_disconnected")
    def _on_operator_left(_participant) -> None:
        if len(ctx.room.remote_participants) == 0:
            logger.info("operator left — ending job for a clean re-dispatch")
            try:
                ctx.shutdown(reason="operator left")
            except Exception as exc:  # noqa: BLE001
                logger.warning("shutdown failed: %s", exc)


if __name__ == "__main__":
    agents.cli.run_app(agents.WorkerOptions(entrypoint_fnc=entrypoint))
