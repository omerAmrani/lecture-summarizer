# Summarization

Generates an AI summary from a lecture transcript. Supports multiple backends and keeps a versioned history of summaries.

## API

- Module: `SummarizeModule`
- Entry point: `LecturesController POST .../summarize` (SSE) — see [lectures.md](lectures.md) for SSE details

**Flow:**
1. Reads `transcript.txt`
2. `getSummarizeBackend()` (`src/credentials.ts`) resolves provider + model; `SummarizeService.getSummarizer(backend)` loads it
3. Resolves the summary prompt once: the body's One-off `prompt` → the saved Custom prompt → `DEFAULT_SUMMARY_PROMPT`
4. `mergeSummaries([transcript], apiKey, model, prompt, onProgress, onToken)` — chunking + merge logic
5. Saves result as a new versioned file, with its prompt next to it; sets it as `currentSummary`
6. Sets lecture status: `summarizing` → `summarized`

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

**Summary prompt** (see `GLOSSARY.md`):
- `buildPrompt(transcript, prompt)` in `backends/prompt.ts` always appends `\n\nTranscript:\n<transcript>` after the prompt, so an edited prompt can't drop the transcript.
- The Default prompt asks for one topic per `[mm:ss]` section, self-contained, with every exam-relevant detail, nothing from outside the lecture, and no length limit: each section becomes a study-system Source passage (see [study.md](study.md)).
- Custom prompt: `GET /api/settings/summarize-prompt` → `{ prompt, default, isCustom }`; `PUT` `{ prompt }` saves it; `DELETE` resets to the Default prompt. Stored in `app_settings` (`summarizePrompt`) only, no `meta.json` mirror. Saving the Default prompt's exact text stores nothing (not custom).
- Validation (`validateSummaryPrompt`, shared by `PUT` and the summarize body): trimmed, non-empty, at most 10,000 chars, else `400`.
- The prompt is resolved once at the start of a run, so changing Settings mid-run doesn't affect it.
- Each version saves the full prompt it used as `summaries/<id>.prompt.txt` next to `<id>.md` (deleted with it). `GET .../summaries` returns it as `prompt`; `null` for versions made before prompts were saved.
- The output-language rule (`SYSTEM_PROMPT`) is not part of the summary prompt and isn't editable.

**Versions:** each run appends a new version entry. `currentSummary` on the lecture points to the active one. Old versions can be switched to or deleted via the summaries routes.

**Output language:** hardcoded to Hebrew via `SYSTEM_PROMPT` in `backends/prompt.ts`, passed as the API's native `system` instruction (not a user-content string) for stronger adherence on long transcripts. There is no `OUTPUT_LANG` config — no per-language setting exists yet.

## Web

- Lecture detail page — summary rendered as markdown; version history panel; re-summarize with provider + model picker, preset to the saved default; editable prompt per version (One-off prompt, or save as Custom prompt)
- Settings page — default provider + model picker; Custom prompt editor with reset
- See [lectures.md](../../web/docs/lectures.md)
