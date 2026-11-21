# Send to study system

Sends a summary Omer checked to study-system's Lecture summary ingest (study-system #166), which turns it into Source passages, Lecturer notes and Suggestions. Replaced the summary mail (issue #11). See `GLOSSARY.md`.

## API

- Module: `StudyModule` (`StudyService`), used by `LecturesModule`
- Config from the repo-root `.env`: `STUDY_SYSTEM_URL` (the endpoint, e.g. `https://<site>/api/lecture`) and `STUDY_PUSH_TOKEN` (same value as `LECTURE_PUSH_TOKEN` on study-system). Key names are spelled once in `src/credentials.ts` (`ENV_KEYS.study`) and shown by `GET /api/config/status` as `study`.

Route:
- `POST /api/classes/:classId/lectures/:lectureId/study` — body `{ summaryId? }` (default: the current summary). Ownership-checked like the other lecture routes. Sends `{ course, lecture_date, summary }` with `authorization: Bearer <token>`; `course` is the first 5-digit number in the class `code` (from OPAL), `lecture_date` the lecture's `lectureDate`. Answers `{ sentAt, passages, duplicates, notes, suggestions, sections }`.

Errors: `400` missing `.env` keys / no course number / no lecture date / no summary (nothing is sent), `502` study-system refused or failed (its `error` is passed on, e.g. a summary without `[mm:ss]` lines) or did not answer within 3 minutes.

## Behavior

- Never automatic: summarize does not send.
- Sending again is allowed (e.g. after "סכם מחדש"): study-system replaces that lecture's passages and its unanswered items.
- On success it writes `studySentAt` and clears `lastStudyError`; on failure it writes `lastStudyError`. Both are in the DB and mirrored to `meta.json`.
- The Default prompt keeps `[timestamp]` per section (study-system splits on it) and keeps admin announcements and exam-scope remarks as their own section (they become Lecturer notes there).

## Tests

`test/study.spec.ts` (`fetch` mocked): course number parsing, payload + token + counts + `studySentAt`, the version on screen and a second send, 400 cases with nothing sent, study-system error → 502 + `lastStudyError`, 404 for another user's class.

## Web

See [lectures.md](../../web/docs/lectures.md) and [settings.md](../../web/docs/settings.md).
