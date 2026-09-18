"""JARVIS long-term memory — durable notes that persist across sessions.

The `remember` tool appends concise facts here; on the next Wake, `memory_block()` loads
them back into JARVIS's system instruction, so it boots already knowing the operator.

Stored as a plain JSON list next to the agent (`jarvis_memory.json`). This is per-user
runtime data — git-ignored, not code. Reads/writes are defensive: a missing or corrupt
file never crashes the agent, it just means "no memory yet".
"""

from __future__ import annotations

import json
import logging
import os
from datetime import datetime, timezone

logger = logging.getLogger("jarvis")

_MEMORY_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "jarvis_memory.json")


def load_notes() -> list[dict]:
    """Return the saved notes (oldest first). Missing/corrupt file -> empty list."""
    try:
        with open(_MEMORY_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
        if isinstance(data, list):
            return data
        logger.warning("memory file isn't a list; treating as empty")
    except FileNotFoundError:
        pass
    except (json.JSONDecodeError, OSError) as exc:
        logger.warning("couldn't read memory (%s); treating as empty", exc)
    return []


def add_note(note: str) -> None:
    """Append one concise fact and persist it with an atomic replace."""
    note = (note or "").strip()
    if not note:
        return
    notes = load_notes()
    notes.append({"note": note, "ts": datetime.now(timezone.utc).isoformat(timespec="seconds")})
    tmp = _MEMORY_PATH + ".tmp"
    try:
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(notes, f, ensure_ascii=False, indent=2)
        os.replace(tmp, _MEMORY_PATH)  # atomic: never leaves a half-written file
        logger.info("remembered: %s", note)
    except OSError as exc:
        logger.warning("couldn't save memory: %s", exc)


def memory_block() -> str:
    """The MEMORY section appended to the system instruction (empty string if no notes)."""
    lines = [f"- {n['note']}" for n in load_notes() if n.get("note")]
    if not lines:
        return ""
    return (
        "\n\nMEMORY — what you already know about the operator from past sessions. Treat "
        "these as things you genuinely remember: recall them naturally and don't re-ask "
        "what's already here.\n" + "\n".join(lines)
    )
