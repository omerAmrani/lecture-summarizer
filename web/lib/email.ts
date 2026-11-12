import { apiFetch } from './api';

async function send(url: string, init: RequestInit): Promise<void> {
  const r = await apiFetch(url, init);
  if (r.ok) return;
  const data = await r.json().catch(() => null);
  throw new Error(data?.error || 'שגיאה');
}

const json = (method: string, body?: unknown): RequestInit => ({
  method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body),
});

// Recipient of summary mails (see GLOSSARY.md); null = mail off.
export async function fetchMailRecipient(): Promise<string | null> {
  const r = await apiFetch('/api/settings/email');
  return (await r.json()).recipient ?? null;
}

export const saveMailRecipient = (recipient: string) => send('/api/settings/email', json('PUT', { recipient }));
export const sendTestMail = () => send('/api/settings/email/test', json('POST'));
export const sendSummaryMail = (classId: string, lectureId: string) =>
  send(`/api/classes/${classId}/lectures/${lectureId}/email`, json('POST'));
