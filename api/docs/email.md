# Summary mail

Emails a lecture's summary to the **Recipient** (see `GLOSSARY.md`) after a successful summarize, and on demand from the lecture page.

## API

- Module: `EmailModule` (`EmailService`), used by `LecturesModule` and `JobsModule`
- Transport: SMTP via `nodemailer`, created per send. Config from the repo-root `.env`: `SMTP_HOST`, `SMTP_PORT` (default 587; 465 = TLS), `SMTP_USER`, `SMTP_PASS`, optional `SMTP_FROM` (default `SMTP_USER`). Key names are spelled once in `src/credentials.ts` (`ENV_KEYS.smtp`) and shown by `GET /api/config/status` as `smtp`. Gmail needs an app password.

Routes:
- `GET/PUT /api/settings/email` — `{ recipient }`. One address, trimmed; empty or `null` clears it (mail off). Anything else, including lists, is a `400`. Stored in `app_settings` only (no `meta.json` mirror, like the Custom prompt).
- `POST /api/settings/email/test` — sends a short fixed mail to the Recipient.
- `POST /api/classes/:classId/lectures/:lectureId/email` — sends the current summary now ("send again"), even if already sent. Ownership-checked like the other lecture routes.

Errors on the two POSTs: `400` no Recipient / no SMTP keys / no summary, `502` SMTP rejected the send.

## Behavior

- After `summarize` sets `status: 'summarized'`, `sendAfterSummarize` runs fire-and-forget: it never delays the SSE `done` event and never fails the summarize.
- It is **skipped silently** when there is no Recipient, no SMTP keys, or `emailSentAt` is already set — so a re-summarize does not mail again.
- On success it writes `emailSentAt` and clears `lastEmailError`; on failure it writes `lastEmailError` and leaves `emailSentAt` empty (the lecture stays `summarized`). Both fields are in the DB and mirrored to `meta.json`.
- Mail content: subject `<course> – <lecture>`, body is the current summary (plain text + escaped, RTL, pre-wrapped HTML — markdown is not rendered) followed by a link to the lecture in the web UI, built from `WEB_ORIGIN`. No transcript attached.
- No automatic retry yet. A failed lecture is retried with "send again"; a catch-up pass belongs to the scheduled pipeline (issue #8).

## Tests

`test/email.spec.ts` (nodemailer mocked): Recipient validation, send-once + link/escaping, skip when unconfigured, SMTP failure keeps `summarized` and stores `lastEmailError`, resend after sent, 400/502/404 cases, test mail.

## Web

See [settings.md](../../web/docs/settings.md) and [lectures.md](../../web/docs/lectures.md).
