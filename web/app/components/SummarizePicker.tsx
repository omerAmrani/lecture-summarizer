'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import type { ConfigStatus } from '@/lib/configStatus';
import { Select } from './Select';

export type Backend = 'gemini' | 'claude' | 'openai';
export interface SummarizeChoice {
  backend: Backend;
  model: string | null;
}
interface ModelOption {
  id: string;
  name: string;
  recommended?: boolean;
}

const PROVIDERS: { value: Backend; label: string }[] = [
  { value: 'gemini', label: 'Gemini (Google)' },
  { value: 'claude', label: 'Claude (Anthropic)' },
  { value: 'openai', label: 'OpenAI (ChatGPT)' },
];

const configured = (status: ConfigStatus | null, b: Backend) => !status || status[b];

// Saved default (Settings) if its provider has a key, else the first provider that does.
export function useSummarizeDefault(status: ConfigStatus | null): SummarizeChoice | null {
  const [choice, setChoice] = useState<SummarizeChoice | null>(null);
  useEffect(() => {
    if (!status) return;
    const fallback = (): SummarizeChoice => ({
      backend: PROVIDERS.find((p) => status[p.value])?.value ?? 'gemini',
      model: null,
    });
    apiFetch('/api/settings/summarize')
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { default?: SummarizeChoice | null } | null) => {
        const saved = data?.default;
        setChoice(saved && status[saved.backend] ? saved : fallback());
      })
      .catch(() => setChoice(fallback()));
  }, [status]);
  return choice;
}

function useModels(backend: Backend, enabled: boolean) {
  const [state, setState] = useState<{ models: ModelOption[]; error: string | null; loading: boolean }>({
    models: [],
    error: null,
    loading: false,
  });
  useEffect(() => {
    if (!enabled) return setState({ models: [], error: null, loading: false });
    let cancelled = false;
    setState({ models: [], error: null, loading: true });
    apiFetch(`/api/models/${backend}`)
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data?.error || 'שגיאה בטעינת מודלים');
        return data.models as ModelOption[];
      })
      .then((models) => !cancelled && setState({ models, error: null, loading: false }))
      .catch((e) => !cancelled && setState({ models: [], error: e.message, loading: false }));
    return () => {
      cancelled = true;
    };
  }, [backend, enabled]);
  return state;
}

interface Props {
  value: SummarizeChoice;
  onChange: (v: SummarizeChoice) => void;
  status: ConfigStatus | null;
}

export function SummarizePicker({ value, onChange, status }: Props) {
  const hasKey = configured(status, value.backend);
  const { models, error, loading } = useModels(value.backend, hasKey);

  // No model yet (or it's gone from the provider): take the top one — recommended models come first.
  useEffect(() => {
    const top = models[0];
    if (!top || models.some((m) => m.id === value.model)) return;
    onChange({ ...value, model: top.id });
  }, [models, value, onChange]);

  return (
    <>
      <Select
        full
        testId="provider-select"
        value={value.backend}
        onChange={(b) => onChange({ backend: b as Backend, model: null })}
        options={PROVIDERS.map((p) => ({
          ...p,
          disabled: !configured(status, p.value),
          tag: configured(status, p.value) ? undefined : 'אין מפתח',
        }))}
      />
      <Select
        full
        testId="model-select"
        value={value.model ?? ''}
        onChange={(model) => onChange({ ...value, model })}
        placeholder={loading ? 'טוען מודלים...' : error ? 'לא ניתן לטעון מודלים' : 'בחר מודל'}
        options={models.map((m) => ({ value: m.id, label: m.name, tag: m.recommended ? 'מומלץ' : undefined }))}
      />
      {error && <span style={{ fontSize: '0.75rem', color: 'var(--error)' }}>{error}</span>}
    </>
  );
}
