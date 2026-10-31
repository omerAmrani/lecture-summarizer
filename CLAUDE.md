# Lecture Summarizer

Turns Open University (OPAL) lecture recordings into transcripts and summaries.

## Structure

- api — NestJS API, lecture processor (Groq/Gemini/Claude/Ollama), SQLite
- web — Next.js 15 web UI for the above
- tray — macOS tray app (Swift)

## Package Manager

pnpm with workspaces (`api`, `web`). Always run installs from root.

## Commands

Run both apps: `pnpm dev`

Run or build one app:
turbo run dev --filter=@lecture-summarizer/<api|web>
turbo run build --filter=@lecture-summarizer/<api|web>

Add a dep to one app:
pnpm add <package> --filter=@lecture-summarizer/<api|web>

Add a dep to root (dev tooling only):
pnpm add -D <package> -w

## Before Implementing UI or Backend Changes

- For Next.js: prefer modules from `node_modules` lib utilities and Next.js built-ins before adding custom implementations

## Conventions

- Each app has its own .env.local, never commit secrets


## Docs

- `docs/` inside each app is the source for feature-specific documentation
- When adding or changing a feature, update or create only the doc file(s) for that feature — if the feature spans multiple docs, update each affected one, but don't touch unrelated docs in the same `docs/` dir
- Docs are written in English, markdown format

## Testing

- Each feature has one spec file named after its module/route (e.g. `test/lectures.spec.ts`, `tests/settings.spec.ts`) — after a change, run only that file: `pnpm --filter=@lecture-summarizer/<api|web> test <feature>.spec.ts`

## Before Writing Any Code

**Map the blast radius.** What modules, services, or contracts does this change touch? What currently depends on what's being changed? Write this out before touching code — not after.

**Think unhappy paths first.** Before implementing: what is the state of the system if this fails halfway? Is data left in a consistent state? Is the failure recoverable without manual intervention? Answer these before writing the happy path.

**Uphold data integrity contracts.** Each app has its own write contract (e.g. DB + filesystem mirror in the API). Any feature that writes data must uphold all sides of that contract — never write to one without the other.

**When to stop and ask.** If a feature touches more than 3 modules, requires a design decision with real trade-offs, or the requirements feel ambiguous — stop and ask before writing code. Rework costs more than a 2-minute clarification.

## Agent skills

### Issue tracker

Issues live in GitHub Issues on omerAmrani/lecture-summarizer (via `gh`). See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary: needs-triage, needs-info, ready-for-agent, ready-for-human, wontfix. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
