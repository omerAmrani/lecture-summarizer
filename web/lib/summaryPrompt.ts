import { apiFetch } from './api';

// Custom prompt from Settings, or the Default prompt when none is saved.
export interface SummaryPromptState { prompt: string; default: string; isCustom: boolean }

const URL = '/api/settings/summarize-prompt';

async function send(init?: RequestInit): Promise<SummaryPromptState> {
  const r = await apiFetch(URL, init);
  const data = await r.json();
  if (!r.ok) throw new Error(data?.error || 'שגיאה');
  return data;
}

export const fetchSummaryPrompt = () => send();

export const saveSummaryPrompt = (prompt: string) =>
  send({ method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt }) });

export const resetSummaryPrompt = () => send({ method: 'DELETE' });
