'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from './api';

// Which keys the API has in its .env — booleans only, never the values
// (see GET /api/config/status, docs/adr/0002).
export type CredentialId = 'opal' | 'groq' | 'gemini' | 'claude' | 'openai';

export interface ConfigStatus extends Record<CredentialId, boolean> {
  localMode: boolean;
  // .env key names come from the API, so they're spelled out in one place (api/src/credentials.ts).
  envKeys: Record<CredentialId, string>;
  missing: { transcribe: string[]; summarize: string[] };
}

// null = everything this action needs is set; otherwise a hint for the user.
export function missingFor(status: ConfigStatus | null, action: 'transcribe' | 'summarize'): string | null {
  const missing = status?.missing?.[action];
  if (!missing?.length) return null;
  // transcribe needs every listed key; summarize needs any one of them.
  const list = action === 'transcribe' ? missing.join(', ') : missing.join(' / ');
  return `חסר ב-.env: ${list}`;
}

export function useConfigStatus(): ConfigStatus | null {
  const [status, setStatus] = useState<ConfigStatus | null>(null);
  useEffect(() => {
    apiFetch('/api/config/status')
      .then((r) => (r.ok ? r.json() : null))
      .then(setStatus)
      .catch(() => { /* leave null — actions stay enabled and the API reports what's missing */ });
  }, []);
  return status;
}
