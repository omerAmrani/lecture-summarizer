# Summarization

Generates an AI summary from a lecture transcript. Supports multiple backends and keeps a versioned history of summaries.

## API

- Module: `SummarizeModule`
- Entry point: `LecturesController POST .../summarize` (SSE) — see [lectures.md](lectures.md) for SSE details

**Flow:**
1. Reads `transcript.txt`
2. `getSummarizeBackend()` (`src/credentials.ts`) resolves provider + model; `SummarizeService.getSummarizer(backend)` loads it
3. `mergeSummaries([transcript], apiKey, model, onProgress, onToken)` — chunking + merge logic
4. Saves result as a new versioned file; sets it as `currentSummary`
5. Sets lecture status: `summarizing` → `summarized`

**Backends:**
- `gemini` — Google Gemini (requires `GEMINI_API_KEY`; env default model `GEMINI_MODEL`, `gemini-2.5-flash`)
- `claude` — Anthropic Claude (requires `ANTHROPIC_API_KEY`; env default model `CLAUDE_MODEL`, `claude-haiku-4-5-20251001`)
- `openai` — OpenAI Chat Completions (requires `OPENAI_API_KEY`; `OPENAI_MODEL` has no default, so pick a model in Settings or set it)

**Picking provider + model** (`getSummarizeBackend`):
- Provider: the request's `{ backend }` if given. It's used or rejected with `400`, never silently swapped for another provider. With none requested: the saved default, then `SUMMARIZE_BACKEND`, then any provider with a key.
- Model: the request's `{ model }`, else the saved default's model (only when it's for the same provider), else `<PROVIDER>_MODEL` from `.env`. `400` if none applies.
- The model actually used is stored on the summary version and the lecture (`summarizeModel`).

**Saved default:** `GET/PUT /api/settings/summarize` (`{ backend, model | null }`, `SettingsController` in JobsModule, JWT-guarded). Like `activeSemester` it's app config, stored only in the `app_settings` table, with no `meta.json` mirror.

**Model list:** `GET /api/models/:backend` returns `{ models: [{ id, name, recommended }] }` live from the provider, using the key in `.env` (`400` without a key, `502` if the provider call fails). Claude and OpenAI use their SDK's `models.list()`; Gemini uses the REST `GET /v1beta/models`, since `@google/generative-ai` has no list call. Non-text models (embeddings, audio, image…) are filtered out by name.

**Recommended models** come first in the list and are tagged in the UI: the cheap, long-context tier per provider, matched by name (Gemini `flash`, Claude `haiku`, OpenAI `mini`). No provider API exposes prices, so this is a name heuristic in `summarize.service.ts`.

**Versions:** each run appends a new version entry. `currentSummary` on the lecture points to the active one. Old versions can be switched to or deleted via the summaries routes.

**Output language:** hardcoded to Hebrew via `SYSTEM_PROMPT` in `backends/prompt.ts`, passed as the API's native `system` instruction (not a user-content string) for stronger adherence on long transcripts. There is no `OUTPUT_LANG` config — no per-language setting exists yet.

## Web

- Lecture detail page — summary rendered as markdown; version history panel; re-summarize with provider + model picker, preset to the saved default
- Settings page — default provider + model picker
- See [lectures.md](../../web/docs/lectures.md)
