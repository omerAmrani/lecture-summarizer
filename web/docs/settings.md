# Settings

Single-page control panel at `/settings` for managing app configuration, the processing queue, and AI backends.

## Web

- Page: `/settings`
- Calls multiple API endpoints; all cards load independently on mount

**Data directory:**
- Shows current data path
- "בחר תיקייה" opens a native macOS folder picker via `POST /api/data-dir/pick` (osascript)
- Warns if selected path has no existing DB
- Saving restarts the API server (`process.exit(0)` server-side)

**Reload from disk:**
- `POST /api/reload-from-disk` — re-syncs SQLite from `meta.json` files on disk
- Useful after manually moving data files or recovering from a DB wipe

**Sync (detect new lectures):**
- "בדוק עכשיו" runs `POST /api/classes/sync` (SSE), scoped to the semester picked in the dropdown next to it, using the OPAL credentials from the API's `.env` — see `api/docs/classes.md`
- Detected lectures are created immediately (`pending`) by the API — there's no manual add/skip step. The panel shows existing non-summarized lectures per class plus a "just added" list for whatever the sync run created.
- Only shown for classes with `opalCourseUrl` configured
- List area is capped at 320px with internal scroll to avoid stretching the adjacent settings card
- There's no separate processing-queue panel — a lecture created here processes the same way as any other `pending` lecture (per-lecture action on the class page)
- No scheduled detection — "בדוק עכשיו" is manual; the only automatic Detect is the one-off run right after creating a course (see `classes.md`)

**Credentials** (read-only — credentials live in the repo-root `.env`, see docs/adr/0002):
- Checklist of OPAL / Groq / Gemini / Claude / OpenAI keys from `GET /api/config/status` (✅/❌, never the values). The key names shown come from the status's `envKeys`, not from web code
- Groq / Gemini / Claude / OpenAI provider names link to the provider's API-keys page (new tab); hovering shows a `title` hint with the price tier and which `.env` var to paste into
- No credential form — edit `.env` and restart the API. Transcribe/summarize buttons on the class and lecture pages are disabled with a hint when their keys are missing (`lib/configStatus.ts`)

**Default summarize model** (`SummarizePicker`):
- Provider + model picker, saved with "שמור ברירת מחדל" via `PUT /api/settings/summarize`. The lecture page starts on this choice but can pick another per run.
- Providers without a key in `.env` are disabled and tagged "אין מפתח"
- Models come live from `GET /api/models/:backend`. Recommended (cheap, long-context) ones come first, tagged "מומלץ", and the top one is preselected when no model is saved.

**Summary prompt** (Custom prompt, see `GLOSSARY.md`):
- Textarea prefilled with the active prompt from `GET /api/settings/summarize-prompt`; "מותאם" badge when a Custom prompt is saved
- "שמור" → `PUT` (empty is rejected by the API); "חזור לברירת מחדל" → confirm, then `DELETE`
- Helper text: the transcript is appended automatically after the prompt
- Shared fetch helpers in `lib/summaryPrompt.ts` (also used by the lecture page)

**Summary mail** (Recipient, see `GLOSSARY.md` and `api/docs/email.md`):
- Email input saved with "שמור" via `PUT /api/settings/email`; empty turns mail off. Invalid or multiple addresses show the API's error.
- "שלח מייל בדיקה" (`POST /api/settings/email/test`) is enabled only when the saved Recipient equals the input
- The credentials checklist has a "מייל (SMTP)" row for the `SMTP_*` keys in `.env`
- Helpers in `lib/email.ts` (also used by the lecture page)

**AI model health:**
- Cards for Gemini, Claude and OpenAI
- Per-card test button + "בדוק את כולם" — `POST /health/<gemini|claude|openai>`, which test the key from the API's `.env` (see `api/docs/health.md`)
- Shows status dot, latency, and a sample response excerpt
