import {
  OPENU_USERNAME, OPENU_PASSWORD, OPENU_ID, GROQ_API_KEY, GEMINI_API_KEY, ANTHROPIC_API_KEY, OPENAI_API_KEY,
  SUMMARIZE_BACKEND, GEMINI_MODEL, CLAUDE_MODEL, OPENAI_MODEL, IS_LOCAL_MODE,
} from './config';

// Credentials come from the API's .env (local mode, see docs/adr/0002) and are
// only ever held in memory for the life of a job. Each feature checks only
// the keys it actually needs, so the app boots with none set.
export interface OpalCredentials {
  username: string;
  password: string;
  id: string;
}

export const SUMMARIZE_BACKENDS = ['gemini', 'claude', 'openai'] as const;
export type SummarizeBackendName = (typeof SUMMARIZE_BACKENDS)[number];

export function isSummarizeBackend(name: unknown): name is SummarizeBackendName {
  return SUMMARIZE_BACKENDS.includes(name as SummarizeBackendName);
}

// The only place .env key names are spelled out; the web gets them from GET /api/config/status.
export const ENV_KEYS = {
  opal: 'OPENU_USERNAME / OPENU_PASSWORD / OPENU_ID',
  groq: 'GROQ_API_KEY',
  gemini: 'GEMINI_API_KEY',
  claude: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
} as const;

export const MISSING_CREDENTIALS = {
  opal: `${ENV_KEYS.opal} missing — set them in .env`,
  groq: `${ENV_KEYS.groq} missing — set it in .env`,
  summarize: `${ENV_KEYS.gemini}, ${ENV_KEYS.claude} or ${ENV_KEYS.openai} missing — set one in .env`,
};

export function getOpalCredentials(): OpalCredentials | null {
  if (!OPENU_USERNAME || !OPENU_PASSWORD || !OPENU_ID) return null;
  return { username: OPENU_USERNAME, password: OPENU_PASSWORD, id: OPENU_ID };
}

export function getGroqApiKey(): string | null {
  return GROQ_API_KEY || null;
}

// Read at call time (not captured at module load) so tests can swap config values.
export function summarizeKey(backend: SummarizeBackendName): string | undefined {
  return { gemini: GEMINI_API_KEY, claude: ANTHROPIC_API_KEY, openai: OPENAI_API_KEY }[backend];
}

function envModel(backend: SummarizeBackendName): string | undefined {
  return { gemini: GEMINI_MODEL, claude: CLAUDE_MODEL, openai: OPENAI_MODEL }[backend];
}

export interface SummarizeChoice { backend?: string | null; model?: string | null }
export type ResolvedSummarize =
  | { backend: SummarizeBackendName; apiKey: string; model: string }
  | { error: string };

// Picks provider + model for one summarize run.
// - An explicitly requested provider is used or rejected — never silently swapped for another.
// - With nothing requested: the saved default, then SUMMARIZE_BACKEND, then any provider with a key.
// - Model: the requested one, else the saved default's (same provider only), else <PROVIDER>_MODEL from .env.
export function getSummarizeBackend(requested: SummarizeChoice = {}, saved: SummarizeChoice | null = null): ResolvedSummarize {
  const backend = pickBackend(requested.backend, saved?.backend);
  if ('error' in backend) return backend;
  const apiKey = summarizeKey(backend.name)!;
  const model =
    (requested.backend && requested.model) ||
    (saved?.backend === backend.name ? saved.model : null) ||
    envModel(backend.name);
  if (!model) return { error: `No model chosen for ${backend.name} — pick one in Settings or set ${backend.name.toUpperCase()}_MODEL in .env` };
  return { backend: backend.name, apiKey, model };
}

function pickBackend(requested?: string | null, saved?: string | null): { name: SummarizeBackendName } | { error: string } {
  if (requested) {
    if (!isSummarizeBackend(requested)) return { error: `Unknown backend: ${requested}` };
    if (!summarizeKey(requested)) return { error: `${ENV_KEYS[requested]} missing — set it in .env or pick another provider` };
    return { name: requested };
  }
  for (const name of [saved, SUMMARIZE_BACKEND, ...SUMMARIZE_BACKENDS]) {
    if (isSummarizeBackend(name) && summarizeKey(name)) return { name };
  }
  return { error: MISSING_CREDENTIALS.summarize };
}

// Booleans only — never expose the values themselves.
export function getCredentialsStatus() {
  const set = {
    opal: !!getOpalCredentials(),
    groq: !!getGroqApiKey(),
    gemini: !!GEMINI_API_KEY,
    claude: !!ANTHROPIC_API_KEY,
    openai: !!OPENAI_API_KEY,
  };
  const anySummarize = SUMMARIZE_BACKENDS.some((b) => set[b]);
  return {
    localMode: IS_LOCAL_MODE,
    ...set,
    envKeys: ENV_KEYS,
    // Key names each action still needs: transcribe needs all listed, summarize needs any one of them.
    missing: {
      transcribe: (['opal', 'groq'] as const).filter((k) => !set[k]).map((k) => ENV_KEYS[k]),
      summarize: anySummarize ? [] : SUMMARIZE_BACKENDS.map((b) => ENV_KEYS[b]),
    },
  };
}
