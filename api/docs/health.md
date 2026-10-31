# Health Checks

Tests AI backend connectivity and latency. Used by the settings page to verify API keys before running the pipeline.

## API

- Module: `HealthModule`
- Controller: `HealthController`

Routes:
- `POST /health/gemini`
- `POST /health/claude`
- `POST /health/openai`
- `GET /health/ping`

No auth guard on any of these — `gemini`/`claude` take the key to test directly in the body, so there's nothing server-side to scope per user.

### `/health/ping`

Lightweight liveness check for the tray app to poll (see `docs/local-service.md`) — no auth, no external calls, no DB access. Response: `{ ok: true }`, always 200 if the process is up.

### `/health/gemini`, `/health/claude` and `/health/openai`

`POST`, no body — checks the key from the API's `.env` (`GEMINI_API_KEY` / `ANTHROPIC_API_KEY` / `OPENAI_API_KEY`, see `src/credentials.ts`, docs/adr/0002). OpenAI has no fixed model to ping, so it lists models instead (no tokens spent); `response` is the model count.

Response: `{ ok: boolean, configured: boolean, ms?: number, response?: string, error?: string }`

- `configured: false` — the key isn't set in `.env`; `ok` will be false
- `configured: true, ok: true` — backend responded successfully
- `configured: true, ok: false` — key sent but the request failed

"Which keys are set" without calling any provider is `GET /api/config/status` → `{ localMode, opal, groq, gemini, claude }` (booleans only, never values) — used by the settings page checklist and to disable transcribe/summarize buttons.

## Web

- Settings page — feature health banner at top of page, AI model cards with per-backend test buttons
- See [settings.md](../../web/docs/settings.md)
