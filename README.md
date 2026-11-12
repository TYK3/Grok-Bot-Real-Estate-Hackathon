# Property Lettings Voice Agent — LiveKit

A property lettings demo built on [LiveKit Agents](https://github.com/livekit/agents). Browse Hamptons rental listings, open a property, and talk to an AI lettings agent (bottom-right call button) that is scoped to that single property, can "see" its floor plan and photos, answers questions, and books viewings.

- **Backend** (`src/`): a Python LiveKit agent using the **xAI plugin** for STT, LLM (Grok) and TTS, and **Silero** (VAD). Each call is scoped to one property via job metadata, with the floor plan/photos loaded into the model's context. Customer details, bookings, and transcripts are saved per session.
- **Frontend** (`client/`): a Next.js app (Tailwind v4 + shadcn/ui + lucide) with a listings grid, per-property detail page, and an in-call view that shows the property panel alongside a live transcript. It also mints LiveKit tokens (with agent dispatch metadata) and serves the captured session data back to the UI.

## What changed: switched to xAI (12 Nov 2026)

The voice agent now runs entirely on xAI. ElevenLabs and OpenAI are no longer used, and their keys are no longer needed.

| Area | Before | Now |
|------|--------|-----|
| Speech-to-text | ElevenLabs `scribe_v2_realtime` | xAI STT (`xai.STT`, English) |
| LLM | OpenAI `gpt-4o-mini` | xAI Grok `grok-4.20-0309-non-reasoning` (`xai.responses.LLM`) |
| Text-to-speech | ElevenLabs default voice | xAI TTS, voice `ara`, text normalisation on so prices and numbers are read naturally |
| End-of-turn detection | ElevenLabs STT signals (`turn_detection="stt"`) | Silero VAD (`turn_detection="vad"`), passed into the session |
| Dependencies | `livekit-agents[elevenlabs,openai,silero]~=1.4` | `livekit-agents[silero,xai]~=1.8` (`uv.lock` regenerated) |
| Env vars | `ELEVEN_API_KEY`, `OPENAI_API_KEY` | `XAI_API_KEY`, plus optional `XAI_TEXT_MODEL` and `XAI_VOICE` |

Files touched: `src/agent.py`, `pyproject.toml`, `uv.lock`, `.env.example`, `README.md`. The tools (viewing booking, customer capture, call summary, web search), prompts and frontend are unchanged. Web search still uses Perplexity.

Notes:
- **Changing the voice:** set `XAI_VOICE` in `.env` and restart the agent. Other voices include `eve`, `sal`, `rex`, `leo` and about 20 more (see the xAI docs).
- **No Podman on Windows?** Download `livekit-server.exe` from the [LiveKit releases](https://github.com/livekit/livekit/releases) and run `livekit-server --dev --bind 127.0.0.1` in place of `podman compose up`.
- **Cloning on Windows:** the file `requirements.md ` (trailing space in the name) can't be checked out on Windows. After the clone reports "checkout failed", run this from Git Bash in the repo to restore everything else:

  ```bash
  git -c core.protectNTFS=false read-tree HEAD
  git -c core.protectNTFS=false update-index --skip-worktree -- "requirements.md "
  git -c core.protectNTFS=false ls-files -z | grep -zv '^requirements.md $' | xargs -0 git checkout HEAD --
  ```
- **On a local LiveKit server**, the agent log shows that LiveKit Cloud's adaptive interruption and audio filter are disabled. That's expected, and the agent falls back to Silero VAD.

## Architecture

```
Browser (client/, Next.js)                     Agent worker (src/agent.py)
  grid  ─▶ /property/[id] ─▶ /call/[id]           AgentSession
                │                                   ├─ STT  → xAI
     GET /api/token?property_id ──┐                 ├─ LLM  → xAI Grok (grok-4.20-0309-non-reasoning)
                │                 │                 ├─ TTS  → xAI (voice "ara")
                ▼                 ▼                 └─ VAD  → Silero (local)
        LiveKit room  ◀── RoomAgentDispatch(metadata={property_id})
                │                                   reads ctx.job.metadata → one property
                │                                   floor plan + photos → ChatContext (vision)
                ▼                                   tools: get_property_details, book_viewing,
   /api/sessions/[room] ◀── data/sessions/<room>/  capture_customer_details, save_call_details
        (booking.json, customer.json, ...)
```

## Prerequisites

- [uv](https://docs.astral.sh/uv/) and Python 3.12+ (backend)
- [Node.js](https://nodejs.org/) 20+ and npm (frontend)
- [Podman](https://podman.io/) (local LiveKit server)
- [xAI API key](https://console.x.ai) (`XAI_API_KEY`)

## Setup

1. Backend dependencies:

```bash
uv sync
```

2. Backend env file:

```bash
cp .env.example .env
```

Fill in `XAI_API_KEY`. The LiveKit vars are pre-filled for the local Podman server.

3. Download the Silero VAD model (one-time):

```bash
uv run python src/agent.py download-files
```

4. Frontend dependencies and env:

```bash
cd client
npm install
cp .env.example .env
```

The client `.env` reuses the same `LIVEKIT_URL` / `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` as the agent, plus `AGENT_NAME=property-agent` and `SESSIONS_DIR=../data/sessions`.

## Run locally

**Terminal 1** — LiveKit media server:

```bash
podman compose up
```

The `--dev` flag in `compose.yml` uses built-in dev credentials (`devkey` / `secret`).

**Terminal 2** — agent worker:

```bash
uv run python src/agent.py dev
```

You should see `registered worker` when it connects to `ws://localhost:7880`.

**Terminal 3** — web client:

```bash
cd client
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), pick a property, and click **Ask about this property** (bottom-right). The client mints a token that dispatches the `property-agent` into a room named for that property; the agent joins scoped to that listing.

## How a call is scoped to one property

- The client requests `GET /api/token?property_id=<id>` ([client/src/app/api/token/route.ts](client/src/app/api/token/route.ts)), which mints a LiveKit token with `RoomAgentDispatch(agent_name="property-agent", metadata={ property_id })`.
- The agent reads `ctx.job.metadata` in [src/agent.py](src/agent.py), loads just that property from [work/hamptons_e14_2dr_lettings.json](work/hamptons_e14_2dr_lettings.json), builds property-specific instructions, and preloads the floor plan + photos into the `ChatContext` as images.
- Session output is written to `data/sessions/<room>/` (`session.json`, `booking.json`, `customer.json`, `call_summary.txt`, `transcript.txt`) and surfaced live in the UI via `GET /api/sessions/<room>`.

## Environment variables

| Variable | Where | Purpose |
|----------|-------|---------|
| `LIVEKIT_URL` | agent + client | WebSocket URL (`ws://localhost:7880` locally) |
| `LIVEKIT_API_KEY` | agent + client | API key (`devkey` for local Podman) |
| `LIVEKIT_API_SECRET` | agent + client | API secret (`secret` for local Podman) |
| `XAI_API_KEY` | agent | xAI STT, Grok LLM and TTS |
| `XAI_TEXT_MODEL` | agent | Optional Grok model (default `grok-4.20-0309-non-reasoning`) |
| `XAI_VOICE` | agent | Optional TTS voice (default `ara`) |
| `AGENT_NAME` | client | Dispatch name (`property-agent`) |
| `SESSIONS_DIR` | client | Path to the agent's session output (`../data/sessions`) |

## Development

```bash
uv run ruff check .
uv run ruff format .
cd client && npm run build
```

## Project structure

```
.
├── src/
│   ├── agent.py            # Property voice agent (scoped per property, vision-enabled)
│   ├── properties.py       # Property catalogue loader + formatting
│   └── session_store.py    # Per-session persistence (booking/customer/summary/transcript)
├── client/                 # Next.js frontend (grid, detail, in-call view, API routes)
│   └── src/app/
│       ├── page.tsx                    # Listings grid
│       ├── property/[id]/page.tsx      # Property detail + call button
│       ├── call/[id]/page.tsx          # In-call view
│       └── api/token, api/sessions     # Token minting + live session data
├── work/                   # Hamptons lettings dataset (+ scraped source pages)
├── data/sessions/          # Per-call output written by the agent
├── compose.yml             # Local LiveKit server
└── pyproject.toml
```

## Docs

- [Agent dispatch (job metadata)](https://docs.livekit.io/agents/server/agent-dispatch/)
- [Images & vision](https://docs.livekit.io/agents/multimodality/vision/images/)
- [React voice frontend](https://docs.livekit.io/frontends/start/react-quickstart/)
```
