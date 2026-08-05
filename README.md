# JARVIS AIOS

A voice **and vision** AI assistant with a glowing heads-up display. You talk; **Gemini
3.1 Flash Live** (native audio) hears you, thinks, and answers out loud in real time. It
can also **see you through your webcam** and paint charts, stats, lists and cards on the
HUD in sync with what it says.

It's a general conversationalist — no fixed command set, no "I'm just a language model."
Ask it anything, show it something on camera, or ask it to put data on screen.

```
  You ──voice──►  ┌─────────────┐  ──voice──►  You
  You ──camera──► │   Gemini    │
                  │ 3.1 Flash   │  ──calls a tool──►  paint the HUD
                  │    Live     │
                  └──────┬──────┘
                         │  (bridged by the Python agent)
                   LiveKit room  ──render event (JSON)──►  Next.js HUD
```

## How it's built — three parts sharing one LiveKit room

| Part | Tech | Runs | Job |
|---|---|---|---|
| **HUD** | Next.js 14 + Tailwind + MediaPipe | your browser | what you see & click — mic, reactor core, camera overlay, panels, transcript |
| **Agent** | Python (LiveKit Agents + `livekit-plugins-google`) | your machine | the bridge — joins the room and wires your mic + camera into Gemini, and Gemini's voice back to you |
| **Gemini** | Gemini 3.1 Flash Live (native audio) | Google cloud | the brain + voice |

**LiveKit** is the real-time switchboard: the browser and the agent are both participants
in one room, and your voice, the webcam, Gemini's spoken reply, live captions and the HUD
render events all travel through it.

## What it does
- **Talks about anything**, out loud, with low latency (native audio-to-audio).
- **Sees you** — the webcam is streamed into Gemini, so it can genuinely react to your
  surroundings, what you're holding, and your hand gestures.
- **Local vision overlay** — the HUD also runs [MediaPipe](https://developers.google.com/mediapipe)
  in-browser for object detection and hand-gesture recognition (wave, thumbs up/down,
  OK sign, and more), independent of Gemini.
- **Paints the screen** — four render tools let JARVIS show data while it speaks the
  headline (see the contract below). Up to four panels stack on screen at once.
- **Reactor-core HUD** that animates between listening / thinking / speaking, plus a live
  transcript bar.

## The screen tools (agent ⇄ HUD contract)
JARVIS paints the main area by calling a tool; the agent publishes a JSON render event
over the LiveKit data channel (topic `AIOS`) and the HUD renders it. The five types are
defined once in `agent/render.py` and mirrored in `web/lib/contract.ts`.

| Tool | `render_type` | Payload | HUD shows |
|---|---|---|---|
| `show_chart` | `chart` | `{ title, labels[], values[], unit? }` | line chart |
| `show_stats` | `stat` | `{ title, labels[], values[] }` | stat cards |
| `show_list` | `list` | `{ title, items[] }` | bullet list |
| `show_card` | `card` | `{ title, body }` | text card |
| `clear_screen` | `clear` | `{}` | wipes all panels |

## Prerequisites
- **Python 3.10+**
- **Node.js 18.17+** (LTS recommended)
- A webcam and microphone
- Two free API accounts (below)

## Setup

### 1. Get your own keys (all free tiers)
> These are **your** keys — they stay on your machine in `.env` files that are git-ignored
> and are never uploaded. Everyone who runs JARVIS brings their own.

- **LiveKit** → https://cloud.livekit.io → create a project → *Settings → Keys* → copy the
  **URL**, **API Key**, and **API Secret**.
- **Gemini** → https://aistudio.google.com → *Get API key* → copy it. (Free tier is fine
  for building. Note the free tier may use your data to improve Google's products.)

### 2. The agent (Python)
```bash
cd agent
cp .env.example .env          # then paste your keys into .env
python -m venv .venv
.venv\Scripts\activate        # Windows  (macOS/Linux: source .venv/bin/activate)
pip install -r requirements.txt
python agent.py dev           # registers a worker and waits to be dispatched
```

### 3. The HUD (Next.js)
In a second terminal:
```bash
cd web
cp .env.local.example .env.local   # paste the SAME LiveKit URL / key / secret
npm install
npm run dev                        # http://localhost:3000
```

Open http://localhost:3000, click **Wake JARVIS**, allow mic + camera, and talk.

### One-click launcher (Windows)
`start-jarvis.ps1` boots both the agent and the HUD and opens a borderless Chrome window;
`stop-jarvis.ps1` shuts them down. (A desktop shortcut can point at `start-jarvis.ps1`.)
The manual two-terminal method above is the cross-platform path.

## Notes
- `gemini-3.1-flash-live-preview` is a **preview** model — tighter rate limits and the API
  can shift. If the plugin rejects the model string, run
  `pip install -U "livekit-agents[google]"`. Override the model/voice via `GEMINI_MODEL` /
  `GEMINI_VOICE` in `agent/.env`.
- Native audio uses a **prebuilt** Gemini voice (default `Charon`) — not a custom voice clone.
- If the session ever gets stuck repeating a canned refusal, just reconnect (Wake again) —
  each connect spins up a fresh room and agent.
- The agent and HUD never call each other directly; everything goes through the LiveKit
  room and the render contract.
